// What a desk pays YOU, split by the freight they actually send.
//
// ──────────────────────────────────────────────────────────────────────────
// WHY ONE RATE PER AGENT IS NOT ENOUGH. A desk is not one thing: it posts
// standard freight and it posts oversize, those are held to different rungs,
// and the same desk can be excellent at one and dreadful at the other. On
// Jason's own book, read 2026-11-12:
//
//   ROR   standard $6.05  (+$1.30 over its $4.75 rung)
//         oversize $2.46  (−$3.14 under its $5.60 rung)
//   JVL   standard $3.81  (−$0.94)
//         oversize $7.23  (+$1.63, above prime)
//
// Pooled into a single $/mi they both land in the middle and the list ranks
// them as ordinary — two desks that are exact opposites, drawn the same. Who
// you call depends on what you are hauling, and that is the one question the
// agents page exists to answer.
//
// It also gives the Market page's $16,813 oversize gap a set of names.
// ──────────────────────────────────────────────────────────────────────────

import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import { isDelivered } from "./status";
import { loadRevenue } from "./loads"; // GROSS — agents are measured on market value
import { isSpecializedLoadType } from "@/lib/dimensions";

/** The two books a desk's freight can fall into. They have different rungs. */
export type Book = "standard" | "specialized";

export const bookOf = (l: Load): Book =>
  isSpecializedLoadType(l.load_type) ? "specialized" : "standard";

/**
 * The verdict words, borrowed from the Scorer so a desk's rate reads the same
 * here as a load's does there. `null` means not enough to say.
 */
export type RateVerdict = "below-cost" | "thin" | "profitable" | "solid" | "prime";

export interface BookRate {
  book: Book;
  loads: number;
  /** median gross ÷ DRIVEN mile — the deadhead-inclusive figure used app-wide. */
  rpm: number | null;
  /** the rung this book is held to, for the caption. */
  minimum: number | null;
  /** null below `verdictMinLoads` — a single load is a number, not a verdict. */
  verdict: RateVerdict | null;
}

/**
 * Two loads before a rate gets a verdict.
 *
 * One load is a fact about one load. The page still shows it — a desk that
 * paid $6.25 once is worth knowing about, and Call 3's "worth a second call"
 * is built entirely from such desks — but it is shown as a number with its
 * count, never as a grade.
 */
export const VERDICT_MIN_LOADS = 2;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Driven miles: the odometer window when it is real, else the planning
// loaded + deadhead. Mirrors the Scorer and the rate ladder so one desk's
// rate cannot mean a different thing here than it does there.
const drivenMiles = (l: Load): number => {
  const os = Number(l.odometer_start);
  const oe = Number(l.odometer_end);
  if (Number.isFinite(os) && Number.isFinite(oe) && os > 0 && oe > os) return oe - os;
  return Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0);
};

export const verdictFor = (rpm: number | null, ladder: RateLadder): RateVerdict | null => {
  if (rpm == null) return null;
  const { breakEven, minimum, target, prime } = ladder;
  if (breakEven == null || minimum == null || target == null || prime == null) return null;
  if (rpm < breakEven) return "below-cost";
  if (rpm < minimum) return "thin";
  if (rpm < target) return "profitable";
  if (rpm < prime) return "solid";
  return "prime";
};

/**
 * One desk's rate in each book, each graded against its own ladder.
 *
 * A book the desk has never sent comes back with `loads: 0` and a null rate —
 * never a zero, which on a rate column would read as "they pay nothing".
 */
export const agentByType = (
  loads: Load[],
  ladders: { standard: RateLadder; specialized: RateLadder },
): Record<Book, BookRate> => {
  const out = {} as Record<Book, BookRate>;
  for (const book of ["standard", "specialized"] as const) {
    const ladder = ladders[book];
    const rpms = loads
      .filter((l) => isDelivered(l) && bookOf(l) === book)
      .map((l) => {
        const d = drivenMiles(l);
        return d > 0 ? loadRevenue(l) / d : null;
      })
      .filter((r): r is number => r != null && Number.isFinite(r) && r > 0);
    const rpm = median(rpms);
    out[book] = {
      book,
      loads: rpms.length,
      rpm,
      minimum: ladder.minimum,
      verdict: rpms.length >= VERDICT_MIN_LOADS ? verdictFor(rpm, ladder) : null,
    };
  }
  return out;
};

/**
 * A desk you worked once that paid above the rung for its own freight.
 *
 * Forty-five of Jason's fifty-six desks gave him exactly one load, and those
 * one-offs are 54% of his revenue. Ten of them cleared their own minimum —
 * people who paid properly, once, and were never called back. On the list
 * they are forty-five identical single-load rows that no tier can rank.
 *
 * This is deliberately NOT a ranking. One load cannot be ranked. It is a list
 * of desks that have already shown one good number, best first.
 */
export interface SecondCall {
  agentId: string;
  book: Book;
  rpm: number;
  minimum: number;
  /** how far above the rung that single load landed. */
  over: number;
  deliveredAt: string | null;
}

export const worthASecondCall = (
  loadsByAgent: Map<string, Load[]>,
  ladders: { standard: RateLadder; specialized: RateLadder },
): SecondCall[] => {
  const out: SecondCall[] = [];
  for (const [agentId, loads] of loadsByAgent) {
    const delivered = loads.filter(isDelivered);
    if (delivered.length !== 1) continue; // one-offs only, by definition
    const l = delivered[0];
    const book = bookOf(l);
    const minimum = ladders[book].minimum;
    const d = drivenMiles(l);
    if (minimum == null || d <= 0) continue;
    const rpm = loadRevenue(l) / d;
    if (!Number.isFinite(rpm) || rpm < minimum) continue;
    out.push({
      agentId,
      book,
      rpm,
      minimum,
      over: rpm - minimum,
      deliveredAt: l.delivery_date ?? null,
    });
  }
  // Best first — the biggest number they already showed you.
  return out.sort((a, b) => b.over - a.over);
};

/**
 * What the book actually is, for the list header.
 *
 * The page used to open "8 agents · $549,459 delivered through them", which
 * reads like a customer base. It is a long tail with four relationships in
 * it, and saying so changes what you do with the page.
 */
export interface BookShape {
  desks: number;
  loads: number;
  oneLoadDesks: number;
  oneLoadRevenue: number;
  totalRevenue: number;
  /** share of revenue from desks worked exactly once; null when nothing delivered. */
  oneLoadShare: number | null;
}

export const bookShape = (loadsByAgent: Map<string, Load[]>): BookShape => {
  let desks = 0;
  let loads = 0;
  let oneLoadDesks = 0;
  let oneLoadRevenue = 0;
  let totalRevenue = 0;
  for (const ls of loadsByAgent.values()) {
    const delivered = ls.filter(isDelivered);
    if (delivered.length === 0) continue;
    const rev = delivered.reduce((s, l) => s + loadRevenue(l), 0);
    desks++;
    loads += delivered.length;
    totalRevenue += rev;
    if (delivered.length === 1) {
      oneLoadDesks++;
      oneLoadRevenue += rev;
    }
  }
  return {
    desks,
    loads,
    oneLoadDesks,
    oneLoadRevenue,
    totalRevenue,
    oneLoadShare: totalRevenue > 0 ? oneLoadRevenue / totalRevenue : null,
  };
};
