// The market signal off the national FRED freight index (PPI: specialized
// freight trucking, long-distance) — and what it is ALLOWED to say.
// Jason's rules (the 2026-11-01 numbers audit, nodded): the index's three-month
// direction flipped 41 times in 138 months at the old 0.4% threshold, and the
// +3.2% "firming" of Sep ’26 rode diesel $5.02 → $6.29 — money his 100% fuel
// surcharge already passes through. So:
//   · a move counts only past 2.5% over three months (above the series' own noise),
//   · it must HOLD — the same read on two consecutive prints — before it may
//     nudge anything, and the page prints how many prints agree so he can wait
//     for three,
//   · a move that diesel explains (diesel moved > 10% the same way in the same
//     window) is a fuel move, named as such, never a rate call.
// Pure and clock-free — everything keys off the series' own months.

export type MarketDirection = "firming" | "flat" | "softening";

// A three-month move smaller than this reads as "flat" (the index's median
// three-month move is 1.2%; its 75th percentile 2.6%).
export const DIR_THRESHOLD = 0.025;
// Diesel moving more than this, the same way, in the same window explains an
// index move — the PPI carries fuel surcharges.
export const FUEL_THRESHOLD = 0.1;
// Consecutive prints that must agree before a direction holds.
export const PRINTS_TO_HOLD = 2;
// Divergence needed to call you "beating" / "lagging" the market.
export const GAP_THRESHOLD = 0.03; // 3 pts
// Standard loads needed on each side of a you-vs-market read.
export const YVM_MIN_LOADS = 8;

export interface SeriesPoint {
  month: string; // 'YYYY-MM'
  value: number;
}

// 'YYYY-MM' shifted by whole months.
export const shiftMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthWord = (ym: string): string => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;
// "Jul–Sep" (or "Nov–Jan" across a year end).
export const spanWord = (start: string, end: string): string => `${monthWord(start)}–${monthWord(end)}`;

const byMonth = (series: SeriesPoint[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const p of series) if (Number.isFinite(p.value)) m.set(p.month, p.value);
  return m;
};

// The direction read at one print: that month against the month `months`
// before it, by calendar months (a missing month is a missing read, never a
// stretched window).
const readAt = (map: Map<string, number>, month: string, months: number): { direction: MarketDirection; pctChange: number } | null => {
  const last = map.get(month);
  const prev = map.get(shiftMonth(month, -months));
  if (last == null || prev == null || !(prev > 0)) return null;
  const pctChange = (last - prev) / prev;
  const direction: MarketDirection =
    pctChange > DIR_THRESHOLD ? "firming" : pctChange < -DIR_THRESHOLD ? "softening" : "flat";
  return { direction, pctChange };
};

export interface MarketSignal {
  // The direction the calls may lean on: the latest read when it holds and
  // isn't a fuel move — otherwise "flat".
  direction: MarketDirection;
  raw: MarketDirection; // the latest print's own read, before the rules
  pctChange: number; // the index over the trailing window
  prints: number; // consecutive latest prints that agree with `raw` (1 = this print alone)
  holds: boolean; // raw isn't flat and prints ≥ PRINTS_TO_HOLD
  dieselPct: number | null; // diesel over the same window, when the series is there
  fuelDriven: boolean; // diesel moved the same way past FUEL_THRESHOLD
  latestMonth: string; // the print this is read at
  windowStart: string; // the month it is measured against
}

export const marketSignal = (
  index: SeriesPoint[],
  diesel: SeriesPoint[] = [],
  months = 3,
): MarketSignal | null => {
  const map = byMonth(index);
  const sorted = [...map.keys()].sort();
  if (sorted.length === 0) return null;
  const latestMonth = sorted[sorted.length - 1];
  const now = readAt(map, latestMonth, months);
  if (!now) return null;

  // How many prints in a row say the same thing, counting back from the latest.
  let prints = 1;
  for (let k = 1; k <= 12; k++) {
    const r = readAt(map, shiftMonth(latestMonth, -k), months);
    if (!r || r.direction !== now.direction) break;
    prints++;
  }

  // Diesel over the same calendar window (the latest diesel month at or before
  // the index's print, against the month `months` earlier).
  const dmap = byMonth(diesel);
  let dieselPct: number | null = null;
  if (dmap.size > 0) {
    const dmonths = [...dmap.keys()].filter((m) => m <= latestMonth).sort();
    const end = dmonths[dmonths.length - 1];
    const start = end ? dmap.get(shiftMonth(end, -months)) : undefined;
    const endVal = end ? dmap.get(end) : undefined;
    if (end && start != null && start > 0 && endVal != null) dieselPct = (endVal - start) / start;
  }
  const sameWay = dieselPct != null && Math.sign(dieselPct) === Math.sign(now.pctChange);
  const fuelDriven = dieselPct != null && sameWay && Math.abs(dieselPct) > FUEL_THRESHOLD && now.direction !== "flat";

  const holds = now.direction !== "flat" && prints >= PRINTS_TO_HOLD;
  return {
    direction: holds && !fuelDriven ? now.direction : "flat",
    raw: now.direction,
    pctChange: now.pctChange,
    prints,
    holds,
    dieselPct,
    fuelDriven,
    latestMonth,
    windowStart: shiftMonth(latestMonth, -months),
  };
};

// ---- you vs the market ----
// Your standard freight's median rate over the market's last three months
// against the three before them, and the index's average over the same calendar
// months — the same months on both sides, never a partial month, never a thin
// one: fewer than YVM_MIN_LOADS loads on either side is "not enough to compare",
// said with the counts. (The old read compared two single-month medians, one of
// them a five-load home month, on windows ending a month apart.)
export interface YvmSide {
  label: string; // "Jul–Sep"
  start: string;
  end: string;
  n: number; // your standard loads in those months
  median: number | null;
  index: number | null; // the index's mean over those months
}
export type YouVsMarket =
  | { ok: true; yourPct: number; marketPct: number; gap: number; verdict: "beating" | "lagging" | "inline"; recent: YvmSide; prior: YvmSide }
  | { ok: false; recent: YvmSide; prior: YvmSide; need: number };

export const youVsMarket = (
  points: { date: string; rate: number; bucket: string }[],
  market: SeriesPoint[],
  months = 3,
): YouVsMarket | null => {
  const map = byMonth(market);
  const sorted = [...map.keys()].sort();
  if (sorted.length === 0) return null;
  const end = sorted[sorted.length - 1];
  const side = (last: string): YvmSide => {
    const start = shiftMonth(last, -(months - 1));
    const mine = points
      .filter((p) => p.bucket === "standard" && p.date.slice(0, 7) >= start && p.date.slice(0, 7) <= last)
      .map((p) => p.rate)
      .sort((a, b) => a - b);
    const idx: number[] = [];
    for (let k = 0; k < months; k++) {
      const v = map.get(shiftMonth(last, -k));
      if (v != null) idx.push(v);
    }
    const mid = Math.floor(mine.length / 2);
    const median = mine.length === 0 ? null : mine.length % 2 ? mine[mid] : (mine[mid - 1] + mine[mid]) / 2;
    return {
      label: spanWord(start, last),
      start,
      end: last,
      n: mine.length,
      median,
      index: idx.length === months ? idx.reduce((s, v) => s + v, 0) / idx.length : null,
    };
  };
  const recent = side(end);
  const prior = side(shiftMonth(end, -months));
  if (
    recent.n < YVM_MIN_LOADS || prior.n < YVM_MIN_LOADS ||
    recent.median == null || prior.median == null || prior.median <= 0 ||
    recent.index == null || prior.index == null || prior.index <= 0
  )
    return { ok: false, recent, prior, need: YVM_MIN_LOADS };
  const yourPct = (recent.median - prior.median) / prior.median;
  const marketPct = (recent.index - prior.index) / prior.index;
  const gap = yourPct - marketPct;
  const verdict = gap > GAP_THRESHOLD ? "beating" : gap < -GAP_THRESHOLD ? "lagging" : "inline";
  return { ok: true, yourPct, marketPct, gap, verdict, recent, prior };
};

// The signal in one sentence, for titles and captions.
export const indexSentence = (s: MarketSignal | null): string => {
  const p = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  if (!s) return "No freight-index read";
  if (s.fuelDriven) return `Freight index ${p(s.pctChange)} over three months — a fuel move (diesel ${p(s.dieselPct ?? 0)}), not a rate move`;
  if (s.raw === "flat") return `Freight index steady (${p(s.pctChange)} over three months)`;
  if (!s.holds) return `Freight index ${s.raw} for one print (${p(s.pctChange)}) — not yet a call`;
  return `Freight index ${s.raw} for ${s.prints} prints running (${p(s.pctChange)})`;
};
