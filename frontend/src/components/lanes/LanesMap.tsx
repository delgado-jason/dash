import { useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import type { Feature, FeatureCollection, Geometry, MultiPolygon } from "geojson";
import statesTopo from "us-atlas/states-10m.json";
import type { AreaMapDatum, MapLevel } from "@/lib/metrics/lanes";
import { groupKeyForStateName } from "@/lib/metrics/lanes";
import { rpm as fmtRpm } from "@/lib/format";

interface Props {
  data: Record<string, AreaMapDatum>;
  level: MapLevel;
  windowDays: number;
  selected: string | null;
  onSelect: (key: string) => void;
}

type Mode = "rate" | "volume";
// Below this, a shape shades dim in rate mode — one lucky run shouldn't light it.
const MIN_SHAPE_LOADS = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = statesTopo as any;
const usStates = feature(
  topo,
  topo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

const VOL_RAMP = ["#6b4e12", "#9a6c0e", "#c8890a", "#e8940a", "#f5b03a"];
const RATE_RAMP = ["#134e3a", "#1a6b4e", "#26855f", "#35b07a", "#4ade80"];
const NO_DATA = "#2a3347";
const DIM = "#243b33"; // thin shape in rate mode (low confidence)

const FLAME_PATH =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 " +
  ".5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 " +
  "1-3a2.5 2.5 0 0 0 2.5 2.5z";

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

export const LanesMap = ({ data, level, windowDays, selected, onSelect }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [mode, setMode] = useState<Mode>("rate");

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

  const maxLoads = useMemo(
    () => Math.max(1, ...Object.values(data).map((d) => d.loadCount)),
    [data],
  );
  const maxRate = useMemo(
    () =>
      Math.max(
        0.01,
        ...Object.values(data)
          .filter((d) => d.loadCount >= MIN_SHAPE_LOADS && d.medianRpm != null)
          .map((d) => d.medianRpm as number),
      ),
    [data],
  );

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

  const colorFor = (key: string): string => {
    const datum = data[key];
    if (!datum) return NO_DATA;
    if (mode === "volume") {
      const idx = Math.min(
        VOL_RAMP.length - 1,
        Math.floor((datum.loadCount / maxLoads) * VOL_RAMP.length),
      );
      return VOL_RAMP[idx];
    }
    if (datum.medianRpm == null) return NO_DATA;
    if (datum.loadCount < MIN_SHAPE_LOADS) return DIM;
    const idx = Math.min(
      RATE_RAMP.length - 1,
      Math.floor((datum.medianRpm / maxRate) * RATE_RAMP.length),
    );
    return RATE_RAMP[idx];
  };

  const toggle = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className="text-[11px] rounded-full px-2.5 py-0.5"
      style={
        mode === m
          ? { background: m === "rate" ? "#2e9e6b" : "#e8940a", color: "#0d1119", fontWeight: 600 }
          : { border: "1px solid #2a3347", color: "#8b93a3" }
      }
    >
      {label}
    </button>
  );

  const levelWord =
    level === "macro" ? "macro-regions" : level === "region" ? "freight regions" : "states";
  const drillHint = level === "state" ? "click a state to drill in" : "click a region to drill in";

  return (
    <Panel ref={containerRef} noir className="p-4 relative">
      <div className="text-xs text-muted-text mb-2 flex items-center gap-2 flex-wrap">
        <span>Shade by</span>
        {toggle("rate", "your $/mi")}
        {toggle("volume", "volume")}
        <span className="flex items-center gap-1">
          · <Flame size={12} style={{ color: "#e8621e" }} /> best-paying
        </span>
        <span>· grouped by {levelWord} · {drillHint}</span>
      </div>
      <svg viewBox="0 0 900 560" className="w-full">
        {shapes.map((s, i) => {
          const datum = data[s.key];
          const isSel = selected === s.key;
          return (
            <path
              key={i}
              d={s.d}
              fill={colorFor(s.key)}
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
          <g
            key={h.key}
            transform={`translate(${h.c[0]},${h.c[1]}) scale(0.95) translate(-12,-12)`}
            style={{ pointerEvents: "none" }}
          >
            <path d={FLAME_PATH} fill="#e8621e" stroke="#0d1117" strokeWidth={1.2} strokeLinejoin="round" />
          </g>
        ))}
      </svg>
      {hover && (
        <div
          className="absolute pointer-events-none bg-iron border border-plate rounded-md p-2 text-xs text-light z-10"
          style={{ left: hover.x + 12, top: hover.y + 12, maxWidth: 220 }}
        >
          <div className="font-semibold">{hover.datum.key}</div>
          <div className="text-muted-text">
            {hover.datum.loadCount} load{hover.datum.loadCount === 1 ? "" : "s"} · {windowDays}d
          </div>
          <div>
            {hover.datum.medianRpm == null ? (
              <span className="text-muted-text">no rate</span>
            ) : (
              <>
                <span className="font-semibold">{fmtRpm(hover.datum.medianRpm)}</span> /mi median
              </>
            )}
          </div>
          {hover.datum.members.length > 0 && (
            <div className="text-muted-text">{hover.datum.members.join(", ")}</div>
          )}
        </div>
      )}
    </Panel>
  );
};
