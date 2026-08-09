import type { AreaMapDatum } from "@/lib/metrics/lanes";

// One source of truth for map shading, shared by the SVG board and the R3F
// board so the two renderers can never drift. Ramps are the house scales.
export type MapMode = "rate" | "volume";

// Below this, a shape shades dim in rate mode — one lucky run shouldn't light it.
export const MIN_SHAPE_LOADS = 2;

export const VOL_RAMP = ["#6b4e12", "#9a6c0e", "#c8890a", "#e8940a", "#f5b03a"];
export const RATE_RAMP = ["#134e3a", "#1a6b4e", "#26855f", "#35b07a", "#4ade80"];
export const NO_DATA = "#10161f"; // v2 well — unlit territory recedes
export const DIM = "#243b33"; // thin shape in rate mode (low confidence)

export const maxLoadsOf = (data: Record<string, AreaMapDatum>): number =>
  Math.max(1, ...Object.values(data).map((d) => d.loadCount));

export const maxRateOf = (data: Record<string, AreaMapDatum>): number =>
  Math.max(
    0.01,
    ...Object.values(data)
      .filter((d) => d.loadCount >= MIN_SHAPE_LOADS && d.medianRpm != null)
      .map((d) => d.medianRpm as number),
  );

export const colorFor = (
  datum: AreaMapDatum | undefined,
  mode: MapMode,
  maxLoads: number,
  maxRate: number,
): string => {
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
