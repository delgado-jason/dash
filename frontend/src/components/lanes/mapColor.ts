import type { AreaMapDatum } from "@/lib/metrics/lanes";
import type { LedgerRow } from "@/lib/metrics/marketLedger";

// One source of truth for map shading. Two APIs live here on purpose:
//
//   • the ROW api (colorForRow / mapScale / metricThin) — the Lanes page's
//     market ledger, one metric at a time
//   • the DATUM api (VOL_RAMP / NO_DATA / maxLoadsOf) — the dashboard tab's
//     LanesMapThumb, which is a picture of volume and nothing else
//
// Ramps are the house scales, so the two renderers can never drift.

export const VOL_RAMP = ["#6b4e12", "#9a6c0e", "#c8890a", "#e8940a", "#f5b03a"];
export const RATE_RAMP = ["#134e3a", "#1a6b4e", "#26855f", "#35b07a", "#4ade80"];
// The IN half is the same green scale read BACKWARDS: fewer empty miles is
// better, so the brightest end belongs to the smallest number. Both money
// metrics then say the same thing — brighter is better.
export const IN_RAMP = RATE_RAMP;
export const NO_DATA = "#10161f"; // v2 well — unlit territory recedes

// Below this many loads on the metric's own side a market is a story, not a
// market: it gets the hatch, not a shade.
export const MIN_MAP_LOADS = 2;

// The SVG <pattern> id the map defines once and every thin shape fills with.
export const HATCH_ID = "lanesThinHatch";

export const maxLoadsOf = (data: Record<string, AreaMapDatum>): number =>
  Math.max(1, ...Object.values(data).map((d) => d.loadCount));

// ---- the row api ----

export type MapMetric = "out" | "in" | "volume";

export interface MapScale {
  maxOut: number; // highest typical $/mi on the board
  minIn: number; // shortest / longest reload median — the IN ramp's two ends
  maxIn: number;
  maxVolume: number;
}

// How many loads back this row on this metric — what the hatch rule counts.
export const metricLoads = (row: LedgerRow, metric: MapMetric): number =>
  metric === "out"
    ? row.out.loads
    : metric === "in"
      ? row.in.deliveries
      : row.out.loads + row.in.deliveries;

// The figure being shaded, or null when the row has nothing to say on it.
export const metricValue = (row: LedgerRow, metric: MapMetric): number | null =>
  metric === "out"
    ? row.out.typicalRpm
    : metric === "in"
      ? row.in.reloadMilesMedian
      : row.out.loads + row.in.deliveries;

// The ramp ends, over the rows that are thick enough to set them — one lucky
// run shouldn't define the top of the scale.
export const mapScale = (rows: LedgerRow[]): MapScale => {
  const thick = (m: MapMetric) =>
    rows.filter((r) => metricLoads(r, m) >= MIN_MAP_LOADS);
  const outs = thick("out")
    .map((r) => r.out.typicalRpm)
    .filter((v): v is number => v != null);
  const ins = thick("in")
    .map((r) => r.in.reloadMilesMedian)
    .filter((v): v is number => v != null);
  const vols = thick("volume").map((r) => metricLoads(r, "volume"));
  return {
    maxOut: outs.length ? Math.max(...outs) : 0.01,
    minIn: ins.length ? Math.min(...ins) : 0,
    maxIn: ins.length ? Math.max(...ins) : 0,
    maxVolume: vols.length ? Math.max(...vols) : 1,
  };
};

// A market with a single load on this metric's side wears the hatch instead of
// a shade. A market with NO row at all is not thin — it is unknown, and stays
// NO_DATA.
export const metricThin = (
  row: LedgerRow | undefined,
  metric: MapMetric,
): boolean => !!row && metricLoads(row, metric) < MIN_MAP_LOADS;

const rampIndex = (t: number, len: number): number =>
  Math.max(0, Math.min(len - 1, Math.floor(t * len)));

// The shade for one market on one metric. Nothing known → NO_DATA; the caller
// checks `metricThin` first and hatches those.
export const colorForRow = (
  row: LedgerRow | undefined,
  metric: MapMetric,
  scale: MapScale,
): string => {
  if (!row) return NO_DATA;
  const value = metricValue(row, metric);
  if (value == null) return NO_DATA;

  if (metric === "volume")
    return VOL_RAMP[rampIndex(value / Math.max(1, scale.maxVolume), VOL_RAMP.length)];

  if (metric === "out")
    return RATE_RAMP[rampIndex(value / Math.max(0.01, scale.maxOut), RATE_RAMP.length)];

  // IN — inverted: the shortest reload on the board is the brightest green.
  const span = scale.maxIn - scale.minIn;
  const t = span > 0 ? 1 - (value - scale.minIn) / span : 1;
  return IN_RAMP[rampIndex(t, IN_RAMP.length)];
};

// The legend's words, per metric — drawn under the map exactly as the sheet.
export const METRIC_LEGEND: Record<MapMetric, { label: string; more: string }> = {
  out: { label: "OUT · typical $/mi", more: "higher" },
  in: { label: "IN · reload miles", more: "fewer" },
  volume: { label: "Volume", more: "more" },
};
