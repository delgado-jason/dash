import { useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import statesTopo from "us-atlas/states-10m.json";
import type { StateMapDatum } from "@/lib/metrics/lanes";

interface Props {
  data: Record<string, StateMapDatum>;
  windowDays: number;
  selected: string | null;
  onSelect: (state: string) => void;
}

type Mode = "rate" | "volume";
// Below this, a state shades dim in rate mode — one lucky run shouldn't light it up.
const MIN_STATE_LOADS = 2;

// Parsed once at module load — the topology never changes.
const usStates = feature(
  statesTopo,
  statesTopo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

// Volume ramp (amber) → brighter as origin load count rises. Rate ramp (teal→green)
// → brighter as your median $/mi rises. Distinct hues so the toggle reads clearly.
const VOL_RAMP = ["#6b4e12", "#9a6c0e", "#c8890a", "#e8940a", "#f5b03a"];
const RATE_RAMP = ["#134e3a", "#1a6b4e", "#26855f", "#35b07a", "#4ade80"];
const NO_DATA = "#2a3347";
const DIM = "#243b33"; // thin state in rate mode (low confidence)

// lucide "flame" path, filled solid for a comic pin on your best-paying states.
const FLAME_PATH =
  "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 " +
  ".5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 " +
  "1-3a2.5 2.5 0 0 0 2.5 2.5z";

interface HoverState {
  x: number;
  y: number;
  datum: StateMapDatum;
}

export const LanesMap = ({ data, windowDays, selected, onSelect }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [mode, setMode] = useState<Mode>("rate");

  const maxLoads = useMemo(
    () => Math.max(1, ...Object.values(data).map((d) => d.loadCount)),
    [data],
  );
  const maxRate = useMemo(
    () =>
      Math.max(
        0.01,
        ...Object.values(data)
          .filter((d) => d.loadCount >= MIN_STATE_LOADS && d.medianRpm != null)
          .map((d) => d.medianRpm as number),
      ),
    [data],
  );

  // Top-paying states (by windowed RPM) get a flame pin at their centroid.
  const hotStates = useMemo(
    () =>
      usStates.features
        .map((f) => ({ f, d: data[f.properties.name] }))
        .filter((s) => s.d && s.d.avgRpm != null && s.d.loadCount >= 3)
        .sort((a, b) => (b.d!.avgRpm ?? 0) - (a.d!.avgRpm ?? 0))
        .slice(0, 3)
        .map((s) => {
          const [cx, cy] = pathGen.centroid(s.f);
          return { name: s.f.properties.name, cx, cy };
        })
        .filter((h) => Number.isFinite(h.cx) && Number.isFinite(h.cy)),
    [data],
  );

  const colorFor = (name: string): string => {
    const datum = data[name];
    if (!datum) return NO_DATA;
    if (mode === "volume") {
      const idx = Math.min(
        VOL_RAMP.length - 1,
        Math.floor((datum.loadCount / maxLoads) * VOL_RAMP.length),
      );
      return VOL_RAMP[idx];
    }
    if (datum.medianRpm == null) return NO_DATA;
    if (datum.loadCount < MIN_STATE_LOADS) return DIM;
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

  return (
    <Panel ref={containerRef} noir className="p-4 relative">
      <div className="text-xs text-muted-text mb-2 flex items-center gap-2 flex-wrap">
        <span>Shade by</span>
        {toggle("rate", "your $/mi")}
        {toggle("volume", "volume")}
        <span className="flex items-center gap-1">
          · <Flame size={12} style={{ color: "#e8621e" }} /> best-paying
        </span>
        <span>· click a state to drill in</span>
      </div>
      <svg viewBox="0 0 900 560" className="w-full">
        {usStates.features.map((f, i) => {
          const name = f.properties.name;
          const datum = data[name];
          const isSel = selected === name;
          return (
            <path
              key={i}
              d={pathGen(f) ?? undefined}
              fill={colorFor(name)}
              stroke={isSel ? "#f4f7fb" : "rgba(255,255,255,0.15)"}
              strokeWidth={isSel ? 2 : 0.6}
              style={{ cursor: datum ? "pointer" : "default" }}
              onClick={() => datum && onSelect(name)}
              onMouseMove={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (datum && rect) {
                  setHover({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    datum,
                  });
                }
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {hotStates.map((h) => (
          <g
            key={h.name}
            transform={`translate(${h.cx},${h.cy}) scale(0.95) translate(-12,-12)`}
            style={{ pointerEvents: "none" }}
          >
            <path
              d={FLAME_PATH}
              fill="#e8621e"
              stroke="#0d1117"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </svg>
      {hover && (
        <div
          className="absolute pointer-events-none bg-iron border border-plate rounded-md p-2 text-xs text-light z-10"
          style={{ left: hover.x + 12, top: hover.y + 12, maxWidth: 210 }}
        >
          <div className="font-semibold">{hover.datum.state}</div>
          <div className="text-muted-text">
            {hover.datum.loadCount} loads · past year
          </div>
          <div>
            {hover.datum.avgRpm === null ? (
              <span className="text-muted-text">no recent loads</span>
            ) : (
              <>
                <span className="font-semibold">
                  ${hover.datum.avgRpm.toFixed(2)}
                </span>{" "}
                RPM · {windowDays}d
              </>
            )}
          </div>
          {hover.datum.markets.length > 0 && (
            <div className="text-muted-text">
              {hover.datum.markets.join(", ")}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
