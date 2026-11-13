// Market & Rates analytics — pure aggregations over delivered loads so the page
// can show a rate scatter, a market barometer (rolling median), and a tier gauge
// (where your current tiers land as percentiles of the recent market). Clock is
// injected as `now` so everything is testable without touching the real date.
import type { Load } from "@/types/load";
import { dayKey } from "@/lib/perDiem";
import type { RateLadder } from "./rateTargets";
import { loadGross } from "./rateTargets";
import { isSpecializedLoadType } from "@/lib/dimensions";
import { isDelivered } from "./status";

export type RateBucket = "standard" | "hazmat" | "specialized";

export interface RatePoint {
  date: string; // 'YYYY-MM-DD' delivery date
  rate: number; // gross $ per DRIVEN mile (loaded + deadhead)
  bucket: RateBucket;
  loadNumber: string | null;
  // The two halves the rate was made from. Carried so a reader can price the
  // gap to a rung in DOLLARS without re-deriving driven miles from the load —
  // which is where the two definitions of "driven" would drift apart.
  driven: number;
  gross: number;
  loaded: number; // for the deadhead share; 0 when a load logs none
}

// Driven miles = the odometer window when present (truth), else the planning
// loaded + deadhead. Mirrors the Scorer / rate ladder basis.
const drivenMiles = (l: Load): number => {
  const os = Number(l.odometer_start);
  const oe = Number(l.odometer_end);
  if (l.odometer_start != null && l.odometer_end != null && oe > os) return oe - os;
  return Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0);
};

const bucketOf = (l: Load): RateBucket =>
  l.load_type === "hazmat"
    ? "hazmat"
    : isSpecializedLoadType(l.load_type)
      ? "specialized"
      : "standard";

// Delivered loads with a computable gross rate per driven mile, oldest → newest.
export const ratePoints = (loads: Load[]): RatePoint[] =>
  loads
    .filter((l) => isDelivered(l) && l.delivery_date)
    .map((l): RatePoint | null => {
      const d = drivenMiles(l);
      const rate = d > 0 ? loadGross(l) / d : NaN;
      if (!Number.isFinite(rate) || rate <= 0) return null;
      return {
        date: l.delivery_date!.slice(0, 10),
        rate,
        bucket: bucketOf(l),
        loadNumber: l.load_number ?? null,
        driven: d,
        gross: loadGross(l),
        loaded: Number(l.loaded_miles || 0),
      };
    })
    .filter((p): p is RatePoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Median rate per calendar month — the barometer line. Oldest → newest.
export const monthlyMedianRate = (
  points: RatePoint[],
): { month: string; median: number; n: number }[] => {
  const byMonth = new Map<string, number[]>();
  for (const p of points) {
    const m = p.date.slice(0, 7);
    const arr = byMonth.get(m);
    if (arr) arr.push(p.rate);
    else byMonth.set(m, [p.rate]);
  }
  return [...byMonth.entries()]
    .map(([month, rates]) => ({ month, median: median(rates)!, n: rates.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

// Fraction of `xs` at or below `value` (0..1). null when there's no window.
export const percentileOf = (xs: number[], value: number): number | null => {
  if (xs.length === 0) return null;
  return xs.filter((x) => x <= value).length / xs.length;
};

// Points from the trailing `days` window ending at `now` (inclusive of today).
// The one place we define "recent" — everything windowed shares this so the rate,
// the gauge, and the distribution all read the same slice of time.
export const windowPoints = (
  points: RatePoint[],
  now: Date,
  days = 90,
): RatePoint[] => {
  // The operator's own calendar day, like the Lanes ledger — a load delivered
  // "today" is in the window all day, not until 6 pm Central.
  const today = dayKey(now);
  const cut = dayKey(new Date(now.getTime() - days * 86400000));
  return points.filter((p) => p.date > cut && p.date <= today);
};

// Rates from the trailing `days` window ending at `now` (inclusive of today).
export const windowRates = (points: RatePoint[], now: Date, days = 90): number[] =>
  windowPoints(points, now, days).map((p) => p.rate);

// Loads of one type needed before a rung is ranked among them — with fewer,
// each load moves the percentile 20 points and the number says nothing.
export const MIN_LOADS_FOR_PCTILE = 8;

export interface TierGaugeRow {
  label: string;
  value: number; // the rung's gross $/driven mile
  n: number; // this type's loads in the window
  pctile: number | null; // the rung among this type's accepted loads — null under MIN_LOADS_FOR_PCTILE
}

export interface TierGauge {
  rows: TierGaugeRow[];
  windowN: number; // loads in the window, all types
}

// Where your rungs sit among YOUR OWN ACCEPTED LOADS of the same type —
// evidence for the call, never "the market" (only loads you accepted are in
// it, so it reads your discipline as much as the market). Standard rungs rank
// among standard loads; specialized rungs among specialized + hazmat. The
// engine (marketCall) reads the percentile; this never suggests a move itself.
export const tierGauge = (
  points: RatePoint[],
  ladder: RateLadder,
  specLadder: RateLadder,
  now: Date,
  days = 90,
): TierGauge => {
  const std = windowRates(points.filter((p) => p.bucket === "standard"), now, days);
  const spec = windowRates(points.filter((p) => p.bucket !== "standard"), now, days);
  const row = (label: string, value: number | null, w: number[]): TierGaugeRow | null =>
    value != null
      ? { label, value, n: w.length, pctile: w.length >= MIN_LOADS_FOR_PCTILE ? percentileOf(w, value) : null }
      : null;
  const rows = [
    row("Standard target", ladder.target, std),
    row("Standard prime", ladder.prime, std),
    row("Specialized target", specLadder.target, spec),
    row("Specialized prime", specLadder.prime, spec),
  ].filter((r): r is TierGaugeRow => r !== null);
  return { rows, windowN: std.length + spec.length };
};
