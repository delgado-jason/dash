// Market & Rates analytics — pure aggregations over delivered loads so the page
// can show a rate scatter, a market barometer (rolling median), and a tier gauge
// (where your current tiers land as percentiles of the recent market). Clock is
// injected as `now` so everything is testable without touching the real date.
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import { loadGross } from "./rateTargets";
import { isSpecializedLoadType } from "@/lib/dimensions";
import type { MarketDirection } from "./marketSignal";

export type RateBucket = "standard" | "hazmat" | "specialized";

export interface RatePoint {
  date: string; // 'YYYY-MM-DD' delivery date
  rate: number; // gross $ per DRIVEN mile (loaded + deadhead)
  bucket: RateBucket;
  loadNumber: string | null;
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
    .filter((l) => l.load_status === "delivered" && l.delivery_date)
    .map((l): RatePoint | null => {
      const d = drivenMiles(l);
      const rate = d > 0 ? loadGross(l) / d : NaN;
      if (!Number.isFinite(rate) || rate <= 0) return null;
      return {
        date: l.delivery_date!.slice(0, 10),
        rate,
        bucket: bucketOf(l),
        loadNumber: l.load_number ?? null,
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
  const today = now.toISOString().slice(0, 10);
  const cut = new Date(now.getTime() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  return points.filter((p) => p.date > cut && p.date <= today);
};

// Rates from the trailing `days` window ending at `now` (inclusive of today).
export const windowRates = (points: RatePoint[], now: Date, days = 90): number[] =>
  windowPoints(points, now, days).map((p) => p.rate);

export interface TierGaugeRow {
  label: string;
  value: number; // the tier's gross $/driven-mile
  pctile: number; // 0..1 within the trailing window
}

export interface TierGauge {
  rows: TierGaugeRow[];
  windowN: number; // loads in the window (sample size)
  tone: "hot" | "balanced" | "soft" | null;
  suggestion: string | null;
}

// Where your current tiers land as percentiles of the recent market, plus a
// plain-language read. A LOW percentile for your target = the market clears it
// easily (hot → room to raise); a HIGH percentile = it's hard to hit (soft →
// trim). Ideal target sits around the middle of what's out there.
export const tierGauge = (
  points: RatePoint[],
  ladder: RateLadder,
  specLadder: RateLadder,
  now: Date,
  days = 90,
  direction?: MarketDirection,
): TierGauge => {
  const w = windowRates(points, now, days);
  const row = (label: string, value: number | null): TierGaugeRow | null =>
    value != null && w.length > 0
      ? { label, value, pctile: percentileOf(w, value)! }
      : null;
  const rows = [
    row("Standard target", ladder.target),
    row("Standard strong", ladder.strong),
    row("Specialized strong", specLadder.strong),
  ].filter((r): r is TierGaugeRow => r !== null);

  const std = rows.find((r) => r.label === "Standard target");
  let tone: TierGauge["tone"] = null;
  let suggestion: string | null = null;
  if (std && w.length >= 5) {
    if (std.pctile < 0.45) {
      tone = "hot";
      suggestion =
        "Market's running hot — your Standard target sits below the median of recent loads. Room to raise your tiers.";
    } else if (std.pctile > 0.7) {
      tone = "soft";
      suggestion =
        "Market's softening — your Standard target is hard to hit right now. Consider trimming your tiers.";
    } else {
      tone = "balanced";
      suggestion = "Your tiers are well-placed against the current market.";
    }
  } else if (std) {
    suggestion = "Not enough recent loads to read the market confidently yet.";
  }

  // Temper with the macro trend: your own loads lag, so let the FRED direction
  // confirm or caution a raise/trim before you act on it.
  if (direction && tone) {
    if (tone === "hot") {
      if (direction === "softening")
        suggestion =
          "Your loads say hot, but the freight market's turning down — hold, don't chase the peak.";
      else if (direction === "firming")
        suggestion =
          "Market's running hot and the macro's firming too — a confident raise.";
    } else if (tone === "soft") {
      if (direction === "firming")
        suggestion =
          "Your loads are soft, but the macro's firming — hold before you trim; it may be recovering.";
      else if (direction === "softening")
        suggestion =
          "Market's soft and the macro's falling too — the softness looks real. Consider trimming.";
    }
  }
  return { rows, windowN: w.length, tone, suggestion };
};
