import { useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import type { Feature, FeatureCollection, Geometry, MultiPolygon } from "geojson";
import statesTopo from "us-atlas/states-10m.json";
import type { AreaMapDatum, MapLevel } from "@/lib/metrics/lanes";
import { groupKeyForStateName } from "@/lib/metrics/lanes";
import { rpm as fmtRpm } from "@/lib/format";
import {
  colorFor,
  maxLoadsOf,
  maxRateOf,
  type MapMode,
} from "@/components/lanes/mapColor";

interface Props {
  data: Record<string, AreaMapDatum>;
  level: MapLevel;
  windowDays: number;
  selected: string | null;
  onSelect: (key: string) => void;
  noir?: boolean; // legacy flag, kept for the dashboard tab call site
  mode?: MapMode; // controlled from the page statusbar; falls back to internal state
  onModeChange?: (m: MapMode) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = statesTopo as any;
const usStates = feature(
  topo,
  topo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

interface Shape {
  key: string; // group key (state name, or region / macro label)
  d: string; // filled path (a single state, or a member state at grouped levels)
  name: string; // the underlying state name (for keys)
}
interface Outline {
  key: string;
  d: string;
  cx: number;
  cy: number;
}
interface HoverState {
  x: number;
  y: number;
  datum: AreaMapDatum;
}

export const LanesMap = ({
  data,
  level,
  windowDays,
  selected,
  onSelect,
  mode: modeProp,
  onModeChange,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [modeState, setModeState] = useState<MapMode>("rate");
  const mode = modeProp ?? modeState;
  const setMode = onModeChange ?? setModeState;

  // Every state gets a filled path, tagged with the group it belongs to at this
  // level (state name / region / macro). Geometry is static → memo on level.
  const shapes = useMemo<Shape[]>(
    () =>
      usStates.features
        .map((f) => {
          const name = f.properties.name;
          const key = groupKeyForStateName(name, level);
          const d = pathGen(f) ?? "";
          return key && d ? { key, d, name } : null;
        })
        .filter((s): s is Shape => s !== null),
    [level],
  );

  // Merged outlines per group (the "bigger region" borders) — only for the
  // grouped levels; state level draws its own state borders.
  const outlines = useMemo<Outline[]>(() => {
    if (level === "state") return [];
    const buckets = new Map<string, Geometry[]>();
    for (const g of topo.objects.states.geometries) {
      const name = g.properties?.name as string | undefined;
      if (!name) continue;
      const key = groupKeyForStateName(name, level);
      if (!key) continue;
      const arr = buckets.get(key);
      if (arr) arr.push(g);
      else buckets.set(key, [g]);
    }
    const out: Outline[] = [];
    for (const [key, geoms] of buckets) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged = merge(topo, geoms as any) as MultiPolygon;
      const geo = { type: "Feature", properties: {}, geometry: merged } as Feature;
      const d = pathGen(geo);
      const [cx, cy] = pathGen.centroid(geo);
      if (d && Number.isFinite(cx)) out.push({ key, d, cx, cy });
    }
    return out;
  }, [level]);

  const maxLoads = useMemo(() => maxLoadsOf(data), [data]);
  const maxRate = useMemo(() => maxRateOf(data), [data]);

  // Top-paying groups (>= 3 loads) get a flame at their centroid.
  const hot = useMemo(() => {
    const centroid = (key: string): [number, number] => {
      if (level !== "state") {
        const o = outlines.find((x) => x.key === key);
        return o ? [o.cx, o.cy] : [NaN, NaN];
      }
      const f = usStates.features.find((s) => s.properties.name === key);
      return f ? (pathGen.centroid(f) as [number, number]) : [NaN, NaN];
    };
    return Object.values(data)
      .filter((d) => d.medianRpm != null && d.loadCount >= 3)
      .sort((a, b) => (b.medianRpm as number) - (a.medianRpm as number))
      .slice(0, 3)
      .map((d) => ({ key: d.key, c: centroid(d.key) }))
      .filter((h) => Number.isFinite(h.c[0]));
  }, [data, outlines, level]);

  const fillFor = (key: string): string =>
    colorFor(data[key], mode, maxLoads, maxRate);

  const toggle = (m: MapMode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`text-[11px] rounded-full px-2.5 py-0.5 transition-colors ${
        mode === m
          ? "bg-amber text-canvas font-semibold"
          : "border border-hairline text-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  const levelWord =
    level === "macro" ? "macro-regions" : level === "region" ? "freight regions" : "states";
  const drillHint = level === "state" ? "click a state to drill in" : "click a region to drill in";

  return (
    <div ref={containerRef} className="ds2-board p-4 relative">
      <div className="text-xs text-dim mb-2 flex items-center gap-2 flex-wrap">
        <span className="ds2-label">Shade by</span>
        {toggle("rate", "your $/mi")}
        {toggle("volume", "volume")}
        <span className="flex items-center gap-1.5">
          ·{" "}
          <span
            className="inline-block w-2.5 h-2.5 rounded-full border-2 border-amber-hi"
            style={{ boxShadow: "0 0 6px rgba(245,176,58,.7)" }}
          />{" "}
          best-paying
        </span>
        <span className="text-faint">· grouped by {levelWord} · {drillHint}</span>
      </div>
      <svg viewBox="0 0 900 560" className="w-full">
        {shapes.map((s, i) => {
          const datum = data[s.key];
          const isSel = selected === s.key;
          return (
            <path
              key={i}
              d={s.d}
              fill={fillFor(s.key)}
              stroke={
                isSel && level === "state"
                  ? "#f4f7fb"
                  : "rgba(255,255,255,0.12)"
              }
              strokeWidth={isSel && level === "state" ? 2 : 0.5}
              style={{ cursor: datum ? "pointer" : "default" }}
              onClick={() => datum && onSelect(s.key)}
              onMouseMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (datum && rect) {
                  setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, datum });
                }
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {outlines.map((o) => {
          const lit = !!data[o.key];
          const isSel = selected === o.key;
          return (
            <path
              key={o.key}
              d={o.d}
              fill="none"
              stroke={isSel ? "#f4f7fb" : lit ? "rgba(244,247,251,0.85)" : "rgba(255,255,255,0.14)"}
              strokeWidth={isSel ? 2.4 : lit ? 1.6 : 0.8}
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
          );
        })}
        {level !== "state" &&
          outlines.map((o) => {
            const datum = data[o.key];
            if (!datum) return null;
            return (
              <g key={`lbl-${o.key}`} style={{ pointerEvents: "none" }}>
                <text
                  x={o.cx}
                  y={o.cy}
                  textAnchor="middle"
                  style={{ font: "700 12px sans-serif", fill: "#f4f7fb", paintOrder: "stroke", stroke: "#0b0f16", strokeWidth: 3 }}
                >
                  {o.key}
                </text>
                <text
                  x={o.cx}
                  y={o.cy + 13}
                  textAnchor="middle"
                  style={{ font: "9.5px sans-serif", fill: "#cdd8e8", paintOrder: "stroke", stroke: "#0b0f16", strokeWidth: 2.5 }}
                >
                  {datum.loadCount} {datum.loadCount === 1 ? "load" : "loads"}
                </text>
              </g>
            );
          })}
        {hot.map((h) => (
          <circle
            key={h.key}
            cx={h.c[0]}
            cy={h.c[1]}
            r={8}
            fill="none"
            stroke="#f5b03a"
            strokeWidth={2.5}
            style={{
              pointerEvents: "none",
              filter: "drop-shadow(0 0 4px rgba(245,176,58,.8))",
            }}
          />
        ))}
      </svg>
      {hover && (
        <div
          className="absolute pointer-events-none bg-[#040609] border border-hairline rounded-md p-2 text-xs text-dim z-10"
          style={{ left: hover.x + 12, top: hover.y + 12, maxWidth: 220 }}
        >
          <div className="font-semibold text-ink">{hover.datum.key}</div>
          <div>
            {hover.datum.loadCount} load{hover.datum.loadCount === 1 ? "" : "s"} · {windowDays}d
          </div>
          <div>
            {hover.datum.medianRpm == null ? (
              <span>no rate</span>
            ) : (
              <>
                <span className="font-semibold text-ink">{fmtRpm(hover.datum.medianRpm)}</span> /mi median
              </>
            )}
          </div>
          {hover.datum.members.length > 0 && (
            <div className="text-faint">{hover.datum.members.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
};
