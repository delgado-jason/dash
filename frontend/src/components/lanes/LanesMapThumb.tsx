import { useMemo } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import statesTopo from "us-atlas/states-10m.json";
import type { AreaMapDatum } from "@/lib/metrics/lanes";
import { VOL_RAMP, NO_DATA, maxLoadsOf } from "@/components/lanes/mapColor";

// Option C (Jason's pick, 2026-08-09): the dashboard's Lanes tab shows a
// pure THUMBNAIL of the country — hot states glowing by volume, zero
// interactions — with one door to the real situation board on /lanes.
// No second instrument: window/mode/drill live only on the page.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = statesTopo as any;
const usStates = feature(
  topo,
  topo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;
const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

const SHAPES = usStates.features
  .map((f) => ({ name: f.properties.name, d: pathGen(f) }))
  .filter((s): s is { name: string; d: string } => !!s.d);
const OUTLINE = pathGen(mesh(topo, topo.objects.states, (a, b) => a === b)) ?? "";

export const LanesMapThumb = ({
  data,
}: {
  data: Record<string, AreaMapDatum>; // state-level volume shading
}) => {
  const maxLoads = useMemo(() => maxLoadsOf(data), [data]);
  const fillFor = (name: string): string => {
    const d = data[name];
    if (!d) return NO_DATA;
    const idx = Math.min(
      VOL_RAMP.length - 1,
      Math.floor((d.loadCount / maxLoads) * VOL_RAMP.length),
    );
    return VOL_RAMP[idx];
  };
  return (
    <svg viewBox="40 0 820 560" className="w-full block" aria-hidden="true">
      {SHAPES.map((s) => (
        <path
          key={s.name}
          d={s.d}
          fill={fillFor(s.name)}
          stroke="var(--color-hairline-lo)"
          strokeWidth={0.6}
        />
      ))}
      <path d={OUTLINE} fill="none" stroke="var(--color-hairline)" strokeWidth={1} />
    </svg>
  );
};
