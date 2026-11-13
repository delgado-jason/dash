// How each book is doing against ITS OWN rungs — and what the gap is worth.
//
// ──────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS. The Market page used to decide "which freight carries the
// rate" by counting loads below a SHARED break-even. On Jason's last 90 days
// that read standard 30% below, specialized 27% below, and printed "the
// specialized freight carries the rate."
//
// Measured against the rung each book is actually held to:
//
//   standard      10 loads   median $4.32   minimum $4.75   clears it 4 · 40%
//   specialized   11 loads   median $4.54   minimum $5.60   clears it 1 ·  9%
//
// The two books are level at break-even and four and a half times apart at the
// rung that decides whether a load earns anything. Correct arithmetic on the
// wrong denominator reads exactly like correct arithmetic — the whole reason
// two tier sets exist is that the books are held to different rungs, and
// pooling them to one line throws that away.
// ──────────────────────────────────────────────────────────────────────────

import type { RateLadder } from "./rateTargets";

/** A load reduced to what this module needs. */
export interface BookLoad {
  /** gross ÷ DRIVEN miles — deadhead included, as everywhere else. */
  rpm: number;
  /** driven miles, for the money. */
  driven: number;
  /** gross dollars, for the money. */
  gross: number;
  /** the load's own type, so hazmat and oversize can be told apart. */
  loadType: string | null;
}

export type RungKey = "breakEven" | "minimum" | "target" | "prime";
export const RUNG_ORDER: readonly RungKey[] = ["breakEven", "minimum", "target", "prime"];
export const RUNG_LABEL: Record<RungKey, string> = {
  breakEven: "Break-even",
  minimum: "Minimum",
  target: "Target",
  prime: "Prime",
};

export interface RungHit {
  rung: RungKey;
  rate: number;
  /** loads at or above this rung. */
  hit: number;
  of: number;
  /** null when the book is empty — never a zero that reads as "never". */
  share: number | null;
}

export interface BookStanding {
  loads: number;
  median: number | null;
  /** at or above its own minimum. */
  clearsMinimum: number;
  /** what the book booked, and what the same miles pay at its own minimum. */
  booked: number;
  atMinimum: number | null;
  shortBy: number | null;
  /** every rung, with how often it was reached. */
  hits: RungHit[];
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * One book against one ladder.
 *
 * `atMinimum` / `shortBy` are null when the ladder has no minimum rung, rather
 * than zero: "I cannot price this" and "you are exactly on the rung" are
 * different answers and must not share a number.
 */
export const bookStanding = (loads: BookLoad[], ladder: RateLadder): BookStanding => {
  const rates = loads.map((l) => l.rpm);
  const booked = loads.reduce((s, l) => s + l.gross, 0);
  const atMin =
    ladder.minimum != null ? loads.reduce((s, l) => s + l.driven * ladder.minimum!, 0) : null;
  const hits = RUNG_ORDER.map<RungHit | null>((rung) => {
    const rate = ladder[rung];
    if (rate == null) return null;
    const hit = rates.filter((r) => r >= rate).length;
    return { rung, rate, hit, of: loads.length, share: loads.length ? hit / loads.length : null };
  }).filter((h): h is RungHit => h !== null);
  return {
    loads: loads.length,
    median: median(rates),
    clearsMinimum: ladder.minimum == null ? 0 : rates.filter((r) => r >= ladder.minimum!).length,
    booked,
    atMinimum: atMin,
    shortBy: atMin == null ? null : atMin - booked,
    hits,
  };
};

/**
 * Below this many loads IN EACH book, no winner is declared.
 *
 * The rest of this page is scrupulous about evidence — "fewer than 8 to rank",
 * "the engine wants 5 of one type" — while the sentence this replaces would
 * fire on a single load. Five matches the call engine's own floor.
 */
export const CARRIER_MIN_LOADS = 5;

export interface CarrierVerdict {
  /** null when either book is too thin — then `why` says how thin. */
  winner: "standard" | "specialized" | "level" | null;
  why: string;
}

/**
 * Which book is carrying the rate, measured against each one's own minimum.
 *
 * "Level" is a real answer and not a cop-out: inside five points the sample
 * cannot tell them apart, and naming a winner by a hair is how the old
 * sentence went wrong in the first place.
 */
export const carryingTheRate = (
  std: BookStanding,
  spec: BookStanding,
): CarrierVerdict => {
  if (std.loads < CARRIER_MIN_LOADS || spec.loads < CARRIER_MIN_LOADS) {
    return {
      winner: null,
      why: `${std.loads} standard and ${spec.loads} specialized in the window — ${CARRIER_MIN_LOADS} of each before either can be called.`,
    };
  }
  const s = std.clearsMinimum / std.loads;
  const p = spec.clearsMinimum / spec.loads;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (Math.abs(s - p) < 0.05) {
    return {
      winner: "level",
      why: `Both books clear their own minimum about as often — ${pct(s)} standard, ${pct(p)} specialized.`,
    };
  }
  const better = s > p ? "standard" : "specialized";
  const worse = s > p ? spec : std;
  const worseName = s > p ? "Specialized" : "Standard";
  return {
    winner: better,
    why: `Your ${better} freight is carrying the rate. ${worseName} clears its own minimum on ${worse.clearsMinimum} load${worse.clearsMinimum === 1 ? "" : "s"} in ${worse.loads}.`,
  };
};

/**
 * Deadhead as a rate lever: what the same freight would pay per driven mile if
 * the empty share hit your target.
 *
 * The all-in rate is gross ÷ DRIVEN miles, so empty miles dilute it directly —
 * and unlike every other number on this page, that half of the fraction needs
 * nobody's agreement. Returns null rather than a zero when there is nothing to
 * say: no miles, no loaded miles, or already at or under target.
 */
export interface DeadheadLever {
  driven: number;
  loaded: number;
  deadhead: number;
  share: number;
  target: number;
  rateNow: number;
  /** null when already at or better than target — there is no gain to claim. */
  rateAtTarget: number | null;
  gainPerMile: number | null;
}

export const deadheadLever = (
  loads: Array<{ driven: number; loaded: number; gross: number }>,
  target: number,
): DeadheadLever | null => {
  const driven = loads.reduce((s, l) => s + l.driven, 0);
  const loaded = loads.reduce((s, l) => s + l.loaded, 0);
  const gross = loads.reduce((s, l) => s + l.gross, 0);
  if (driven <= 0 || loaded <= 0 || gross <= 0 || target <= 0 || target >= 1) return null;
  const share = (driven - loaded) / driven;
  const rateNow = gross / driven;
  // The same loaded miles, run at the target empty share, is fewer driven
  // miles for the same money. Only a gain when you are actually over target.
  const drivenAtTarget = loaded / (1 - target);
  const better = share > target && drivenAtTarget > 0;
  const rateAtTarget = better ? gross / drivenAtTarget : null;
  return {
    driven,
    loaded,
    deadhead: driven - loaded,
    share,
    target,
    rateNow,
    rateAtTarget,
    gainPerMile: rateAtTarget == null ? null : rateAtTarget - rateNow,
  };
};

// ──────────────────────────────────────────────────────────────────────────
// THE BAROMETER, IN ONE UNIT
//
// The FRED series is an INDEX — a number whose only meaning is relative to its
// own base year. The other line is dollars per driven mile. Drawn on two axes
// the eye reads a crossing or a gap that means nothing at all, and the only
// honest read is "do the two wiggles have the same shape", which is a lot to
// ask of a chart. Jason's words: "it's a little tough to read because it's
// measuring two different metrics against each other."
//
// Rebasing fixes it and turns a shape into a number. Express the index as the
// path YOUR OWN RATE would have taken had it moved with the industry:
//
//     line(m) = your base $/mi × ( index[m] ÷ index[base] )
//
// Both lines are then $/driven mile on one axis, from the same starting point,
// and the distance between them is a sentence: "I'm 47¢ a mile below where the
// index has gone since March."
//
// WHAT IT IS NOT, and the caption must say so: not a market price for his
// freight. There is no oversize spot feed — that search was validated and
// killed twice. It is his own rate moved by the industry's percentage change,
// and the moment it reads as an external benchmark it becomes a number he
// learns to ignore.
// ──────────────────────────────────────────────────────────────────────────

export interface BaroMonth {
  month: string;
  median: number | null;
  ppi: number | null;
}

export interface RebasedBaro {
  months: Array<{ month: string; median: number | null; indexPath: number | null }>;
  /** the months averaged to anchor both lines. */
  baseMonths: string[];
  baseRate: number;
  baseIndex: number;
  /** latest month where both lines have a value — where the gap is read. */
  latest: { month: string; median: number; indexPath: number; gap: number } | null;
}

/**
 * Both series as $/driven mile, anchored on the first `baseN` months that have
 * BOTH a rate and an index.
 *
 * The base is an average, not a single print: anchor on one noisy month and
 * the whole line shifts, which would make the gap an artefact of where the
 * window happens to start.
 *
 * Null when there is no overlap to anchor on — a rebase needs both series.
 */
export const rebaseBarometer = (rows: BaroMonth[], baseN = 3): RebasedBaro | null => {
  const sorted = [...rows].sort((a, b) => (a.month < b.month ? -1 : 1));
  const both = sorted.filter(
    (r) => r.median != null && r.median > 0 && r.ppi != null && r.ppi > 0,
  );
  if (both.length === 0) return null;
  const base = both.slice(0, Math.max(1, Math.min(baseN, both.length)));
  const baseRate = base.reduce((s, r) => s + r.median!, 0) / base.length;
  const baseIndex = base.reduce((s, r) => s + r.ppi!, 0) / base.length;
  if (!(baseRate > 0) || !(baseIndex > 0)) return null;

  const months = sorted.map((r) => ({
    month: r.month,
    median: r.median,
    indexPath: r.ppi != null && r.ppi > 0 ? baseRate * (r.ppi / baseIndex) : null,
  }));
  // The gap is only meaningful where BOTH lines exist.
  let latest: RebasedBaro["latest"] = null;
  for (const m of months) {
    if (m.median != null && m.indexPath != null) {
      latest = {
        month: m.month,
        median: m.median,
        indexPath: m.indexPath,
        gap: m.median - m.indexPath,
      };
    }
  }
  return { months, baseMonths: base.map((b) => b.month), baseRate, baseIndex, latest };
};
