import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import { loadRevenue } from "./loads";
import { getCostBasis } from "./rateTargets";

// THE month metric (Jason, 2026-08-10): "one load will cover my notes — what I
// really need to track is covering my monthly expense threshold, and whether I
// have margin over it." The month's INCOME races the estimated monthly cost —
// the MEAN of the last complete P&L months (cogs + expenses + notes, via
// getCostBasis.trueMonthlyCost — mean on purpose: cost recovery must absorb
// lumpy months, per the house median-vs-mean rule). On that runway the
// operating expenses sit first, the notes ride as the small final slice under
// the threshold, and everything past it is margin. Feeds the Money tab's
// plate and the player card's meter row — one number, one place.
// All month boundaries are UTC, matching the P&L's period keys.

export interface MonthCoverage {
  monthLabel: string; // "August"
  income: number; // the month's income — posted P&L, else MTD from delivered loads
  estimated: boolean; // riding the MTD estimate until the P&L posts
  opEx: number | null; // mean monthly operating cost (cogs + expenses), notes excluded
  notes: number; // monthly note payments — the last slice before margin
  threshold: number | null; // opEx + notes — the month is covered here
  covered: boolean;
  marginOver: number | null; // income − threshold, once covered
  short: number | null; // threshold − income, until then
  coverDay: number | null; // straight-line day-of-month income reaches the threshold
  monthsInMean: number; // complete P&L months feeding the estimate
}

export const monthCoverage = (
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  loads: Load[],
  now: Date,
): MonthCoverage => {
  const monthLabel = now.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const nowKey = now.toISOString().slice(0, 7);

  // The threshold — mean monthly true cost, notes included, from the cost basis.
  const basis = getCostBasis(periods, obligationsMonthly, loads, now);
  const threshold = basis.trueMonthlyCost;
  const opEx = threshold != null ? threshold - obligationsMonthly : null;

  // The month's income: the posted P&L row wins; until it posts, month-to-date
  // income from delivered loads (same money-kept basis the P&L uses). Computed
  // here against the INJECTED clock — the dashboard's getRevenueMTD reads the
  // real clock internally, which would make this untestable.
  const posted = periods.find(
    (p) => p.income_total != null && p.period_month.slice(0, 7) === nowKey,
  );
  const mtd = loads
    .filter(
      (l) =>
        l.load_status === "delivered" &&
        l.delivery_date &&
        l.delivery_date.slice(0, 7) === nowKey,
    )
    .reduce((s, l) => s + loadRevenue(l), 0);
  const income = posted ? (posted.income_total ?? 0) : mtd;
  const estimated = !posted;

  const covered = threshold != null && income >= threshold;
  const marginOver = covered ? income - (threshold as number) : null;
  const short = !covered && threshold != null ? threshold - income : null;

  // Straight-line pace: the day cumulative income reaches the threshold.
  let coverDay: number | null = null;
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (!covered && income > 0 && threshold != null && dayOfMonth > 0) {
    const day = Math.ceil(threshold / (income / dayOfMonth));
    coverDay = day <= daysInMonth ? day : null;
  }

  return {
    monthLabel,
    income,
    estimated,
    opEx,
    notes: obligationsMonthly,
    threshold,
    covered,
    marginOver,
    short,
    coverDay,
    monthsInMean: basis.months,
  };
};
