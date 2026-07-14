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
}

// Parsed once at module load — the topology never changes.
const usStates = feature(
  statesTopo,
  statesTopo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

// Dark-theme amber ramp: dim → bright as origin load count rises.
const RAMP = ["#6b4e12", "#9a6c0e", "#c8890a", "#e8940a", "#f5b03a"];
const NO_DATA = "#2a3347";

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

export const LanesMap = ({ data, windowDays }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const maxLoads = useMemo(
    () => Math.max(1, ...Object.values(data).map((d) => d.loadCount)),
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
    const idx = Math.min(
      RAMP.length - 1,
      Math.floor((datum.loadCount / maxLoads) * RAMP.length),
    );
    return RAMP[idx];
  };

  return (
    <Panel ref={containerRef} className="p-4 relative">
      <p className="text-xs text-muted-text mb-2 flex items-center gap-1 flex-wrap">
        Footprint · shaded by loads ·
        <Flame size={12} style={{ color: "#e8621e" }} /> best-paying states ·
        hover for RPM ({windowDays}d)
      </p>
      <svg viewBox="0 0 900 560" className="w-full">
        {usStates.features.map((f, i) => {
          const name = f.properties.name;
          const datum = data[name];
          return (
            <path
              key={i}
              d={pathGen(f) ?? undefined}
              fill={colorFor(name)}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={0.6}
              style={{ cursor: datum ? "pointer" : "default" }}
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
