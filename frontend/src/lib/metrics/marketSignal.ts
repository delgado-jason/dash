// Market-signal reads off the national FRED freight index (+ the owner's own
// median rate). Pure + clock-free — everything keys off the series' own months,
// so it's testable without touching the date. Powers the dashboard market chip,
// the "you vs the market" readout, and the macro-aware tier-gauge suggestion.

export type MarketDirection = "firming" | "flat" | "softening";

// A move smaller than this over the window reads as "flat" (kills index wobble).
const DIR_THRESHOLD = 0.004; // 0.4%
// Divergence needed to call you "beating"/"lagging" the market.
const GAP_THRESHOLD = 0.03; // 3 pts

// 'YYYY-MM' shifted by whole months.
const shiftMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

// % change between the earliest and latest points inside [start, end] (inclusive).
// null when there aren't two usable points or the base is non-positive.
const pctInWindow = (
  series: { month: string; value: number }[],
  start: string,
  end: string,
): number | null => {
  const w = series
    .filter((p) => p.month >= start && p.month <= end && Number.isFinite(p.value))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
  if (w.length < 2) return null;
  const first = w[0].value;
  const last = w[w.length - 1].value;
  return first > 0 ? (last - first) / first : null;
};

// The freight market's direction from the FRED index over the trailing `months`.
export const marketTrend = (
  series: { month: string; value: number }[],
  months = 3,
): { direction: MarketDirection; pctChange: number } | null => {
  const s = [...series].sort((a, b) => (a.month < b.month ? -1 : 1));
  if (s.length < months + 1) return null;
  const last = s[s.length - 1].value;
  const prev = s[s.length - 1 - months].value;
  if (!(prev > 0)) return null;
  const pctChange = (last - prev) / prev;
  const direction: MarketDirection =
    pctChange > DIR_THRESHOLD ? "firming" : pctChange < -DIR_THRESHOLD ? "softening" : "flat";
  return { direction, pctChange };
};

export interface YouVsMarket {
  yourPct: number; // your median rate's % change over the window
  marketPct: number; // the FRED index's % change over the same window
  gap: number; // yourPct − marketPct
  verdict: "beating" | "lagging" | "inline";
}

// Your rate trend vs the market's over the trailing `months`, anchored on your
// latest data month. A rough read (your monthly medians are thin) — the gap
// threshold keeps small differences reading "inline". null when either side
// lacks two points in the window.
export const youVsMarket = (
  mine: { month: string; median: number }[],
  market: { month: string; value: number }[],
  months = 6,
): YouVsMarket | null => {
  if (mine.length < 2 || market.length === 0) return null;
  const sorted = [...mine].sort((a, b) => (a.month < b.month ? -1 : 1));
  const end = sorted[sorted.length - 1].month;
  const start = shiftMonth(end, -months);
  const yourPct = pctInWindow(
    sorted.map((m) => ({ month: m.month, value: m.median })),
    start,
    end,
  );
  const marketPct = pctInWindow(market, start, end);
  if (yourPct == null || marketPct == null) return null;
  const gap = yourPct - marketPct;
  const verdict =
    gap > GAP_THRESHOLD ? "beating" : gap < -GAP_THRESHOLD ? "lagging" : "inline";
  return { yourPct, marketPct, gap, verdict };
};
