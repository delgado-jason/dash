import { useMemo, useRef, useState } from "react";
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
    <div ref={containerRef} className="bg-plate rounded-lg p-4 relative">
      <p className="text-xs text-muted-text mb-2">
        Footprint · shaded by loads (past year) · hover for RPM (last{" "}
        {windowDays} days)
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
    </div>
  );
};
