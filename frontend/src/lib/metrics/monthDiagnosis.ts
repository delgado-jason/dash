// Why this month.
//
// Two of Jason's ten months lost money and the page rendered both identically:
// a red margin and nothing more. They had OPPOSITE causes. October's revenue
// came in $7,736 under its usual while costs were within $255 of normal — the
// freight simply did not come. August's revenue was only $1,607 soft and costs
// blew out $5,476. One needs you to go book freight; the other needs you to
// stop spending. A number that cannot tell them apart is not a diagnosis.
//
// TWO LEVERS, NOT THREE, AND THE REASON MATTERS. Revenue and cost sum EXACTLY
// to the month's distance from a usual profit: October's −$7,736 and −$255 add
// to −$7,991, which is precisely how far short October fell. Splitting revenue
// further into miles × rate does NOT reconcile — those multiply, so the split
// leaves a cross-term that belongs to neither and October's three come to
// −$9,773 against a real −$7,991. Miles and rate therefore appear as a
// sentence describing the revenue lever, never as a third bar.
import type { ExpensePeriod } from "@/types/expense";

const day = (v: unknown): string => String(v ?? "").slice(0, 10);

/** A month's own figures, or null where the P&L never filed them. */
const totals = (p: ExpensePeriod) => {
  const inc = p.income_total;
  const cost =
    p.cogs_total == null || p.expense_total == null ? null : p.cogs_total + p.expense_total;
  return { inc, cost, profit: inc == null || cost == null ? null : inc - cost };
};

export interface MonthWhy {
  month: string;
  profit: number;
  /** The mean profit of the OTHER filed months — what "a usual month" means. */
  usualProfit: number;
  /** profit − usualProfit. Negative = this month fell short. */
  shortfall: number;
  /** How much of the shortfall is revenue, and how much is cost. They sum. */
  revenueEffect: number;
  costEffect: number;
  /** Which lever dominates — what the month is actually about. */
  verdict: "revenue" | "cost" | "balanced";
  /** Months the comparison stands on, this one excluded. */
  comparedWith: number;
}

/**
 * Why a month came out where it did, against the months around it.
 *
 * THE MONTH IS EXCLUDED FROM ITS OWN BASELINE. Comparing October to an average
 * that contains October pulls the average toward it and understates every
 * effect — most at exactly the extremes you are trying to explain.
 *
 * Null when the month has no totals, or when there is no other filed month to
 * compare against: one month is not a baseline, and saying so beats inventing
 * a verdict from nothing.
 */
export const whyThisMonth = (
  periods: readonly ExpensePeriod[],
  selectedMonth: string,
): MonthWhy | null => {
  const key = day(selectedMonth);
  const filed = periods.filter((p) => {
    const t = totals(p);
    return t.inc != null && t.cost != null && t.profit != null;
  });
  const me = filed.find((p) => day(p.period_month) === key);
  const others = filed.filter((p) => day(p.period_month) !== key);
  if (!me || others.length === 0) return null;

  const mine = totals(me);
  const n = others.length;
  const usualInc = others.reduce((s, p) => s + (totals(p).inc ?? 0), 0) / n;
  const usualCost = others.reduce((s, p) => s + (totals(p).cost ?? 0), 0) / n;
  const usualProfit = usualInc - usualCost;

  const revenueEffect = (mine.inc ?? 0) - usualInc;
  // A cost ABOVE usual hurts, so the effect is its negative — which is what
  // makes the two sum to the shortfall rather than fight each other.
  const costEffect = -((mine.cost ?? 0) - usualCost);
  const shortfall = (mine.profit ?? 0) - usualProfit;

  // "Balanced" is a real answer: a month can be mildly off on both, and
  // naming a winner by a hair would send you chasing the wrong thing. The
  // threshold is a share of the total movement, not a dollar figure, so it
  // behaves the same on a big month and a small one.
  const rev = Math.abs(revenueEffect);
  const cst = Math.abs(costEffect);
  const total = rev + cst;
  const verdict =
    total === 0 || Math.max(rev, cst) / total < 0.65
      ? "balanced"
      : rev > cst
        ? "revenue"
        : "cost";

  return {
    month: key,
    profit: mine.profit ?? 0,
    usualProfit,
    shortfall,
    revenueEffect,
    costEffect,
    verdict,
    comparedWith: n,
  };
};

// ---------------------------------------------------------------------------

/** One (category, month) of spend, as the server returns it. */
export interface CategoryMonth {
  category: string;
  section: string;
  period_month: string;
  amount: number;
}

export interface CategoryOutlier {
  category: string;
  section: string;
  /** What it was this month. */
  amount: number;
  /** What it usually is, this month excluded. */
  usual: number;
  /** amount − usual. Positive = over. */
  over: number;
  /**
   * How far out it is in its OWN spread. Null when the category has never
   * varied (sd 0) — then `over` is the whole story and a σ would be infinite.
   */
  sigma: number | null;
  /** Months of history behind `usual`. */
  months: number;
}

/** Below this a category is doing what it always does, however big the dollars. */
export const OUTLIER_SIGMA = 1.8;
/** And below this the dollars are too small to be worth a line. */
export const OUTLIER_MIN_OVER = 300;

/**
 * Categories that ran outside their own history this month.
 *
 * SPREAD, NOT SIZE. Repairs & maintenance swings $432–$4,990 as a matter of
 * course, so $1,829 over its average is an ordinary month for it. Office
 * expenses sit near $613 and read $2,879 once — same direction, a quarter of
 * the dollars, and the only one that is news. Ranking by dollars alone would
 * put R&M first every time and bury the thing worth knowing.
 *
 * THE BASELINE MONTHS COME FROM THE HISTORY ITSELF, not from the list of
 * months with a P&L. The two are not the same: a month can carry totals and no
 * line items at all, and reading its categories as $0 is how Fuel — present in
 * every month that has lines — came out as "usual $0, never varied before".
 * A month with no lines says nothing about categories and must be left out
 * entirely; within the months that DO have lines, a category's absence is a
 * genuine $0 and belongs in the average.
 */
export const categoryOutliers = (
  history: readonly CategoryMonth[],
  selectedMonth: string,
  minOver = OUTLIER_MIN_OVER,
  minSigma = OUTLIER_SIGMA,
): CategoryOutlier[] => {
  const key = day(selectedMonth);

  // category → month → amount, and the set of months that have any lines.
  const byCat = new Map<string, { section: string; months: Map<string, number> }>();
  const withLines = new Set<string>();
  for (const r of history) {
    const m = day(r.period_month);
    withLines.add(m);
    const e = byCat.get(r.category) ?? { section: r.section, months: new Map() };
    e.months.set(m, (e.months.get(m) ?? 0) + Number(r.amount));
    byCat.set(r.category, e);
  }

  if (!withLines.has(key)) return [];
  const baseline = [...withLines].filter((m) => m !== key);
  if (baseline.length < 2) return []; // one other month is not a spread

  const out: CategoryOutlier[] = [];
  for (const [category, e] of byCat) {
    const amount = e.months.get(key) ?? 0;
    // Absent in a filed month = a real $0 for that category.
    const prior = baseline.map((m) => e.months.get(m) ?? 0);
    const n = prior.length;
    const usual = prior.reduce((s, x) => s + x, 0) / n;
    const over = amount - usual;
    if (over < minOver) continue;

    const variance = prior.reduce((s, x) => s + (x - usual) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);
    const sigma = sd > 0 ? over / sd : null;
    // A category that has never moved has no spread to be outside of, so any
    // rise at all is news — `sigma` null means "judge it on the dollars".
    if (sigma != null && sigma < minSigma) continue;

    out.push({ category, section: e.section, amount, usual, over, sigma, months: n });
  }
  // Most surprising first, with the never-varied ones ranked by dollars.
  return out.sort((a, b) => (b.sigma ?? Infinity) - (a.sigma ?? Infinity) || b.over - a.over);
};
