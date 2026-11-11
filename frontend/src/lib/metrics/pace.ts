// Are you keeping the promise?
//
// The rate floor stopped floating with the miles actually driven (migration
// 109) — it is now fixed cost spread over the miles COMMITTED to. That is only
// honest if something watches the commitment, and this is it.
//
// TWO READOUTS, DELIBERATELY SEPARATE, because they answer different questions
// and one must never be allowed to answer for the other:
//
//   milesPerDayOut  — how hard am I running? It ignores home time entirely, so
//                     a fortnight at home can never make the driving look lazy.
//   landsAt         — will I make the number? It counts the days, including the
//                     ones already marked home-planned.
//
// November '26 is why they are split: 282 miles a day out against a 322
// trailing average — running BELOW his own pace — while still projecting 8,468
// against a 7,500 commitment, because no home days were taken. One card, two
// honest answers, neither blaming him for the other.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { monthMiles } from "./rateTargets";

export interface Pace {
  /** Driven miles so far this month (merged odometer spans). */
  miles: number;
  /** The commitment in force, when there is one. */
  target: number | null;
  /** miles ÷ target. Null without a commitment. */
  pctOfTarget: number | null;
  /** Calendar days of this month gone, today included. */
  daysElapsed: number;
  /** Of those, the ones that were not home days. */
  daysOut: number;
  /** miles ÷ daysOut — how hard the truck ran. Null before a day out happens. */
  milesPerDayOut: number | null;
  /** The same figure over the complete months behind this one. */
  trailingPerDayOut: number | null;
  /** Days left in the month that are not already marked home-planned. */
  daysOutLeft: number;
  /** Where the month lands if today's pace holds across the days left out. */
  landsAt: number | null;
  /** landsAt ÷ target. Null without a commitment or a projection. */
  landsAtPctOfTarget: number | null;
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
const monthKey = (d: Date): string => d.toISOString().slice(0, 7);
/** Days in the UTC month `d` falls in. */
export const daysInMonth = (d: Date): number =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

/**
 * How hard the truck ran over a stretch of complete months — total driven
 * miles over total days NOT at home. Exported because the card shows it beside
 * the current month and a trailing figure computed any other way would not be
 * comparable.
 *
 * Returns null rather than 0 when there is nothing to divide by: "no history"
 * and "stood still" are different answers and must not print the same.
 */
export const perDayOutOver = (
  loads: readonly Load[],
  trips: readonly Trip[],
  homeDays: readonly string[],
  months: readonly { year: number; month: number }[],
): number | null => {
  if (months.length === 0) return null;
  const home = new Set(homeDays.map((d) => String(d).slice(0, 10)));
  let miles = 0;
  let out = 0;
  for (const { year, month } of months) {
    miles += monthMiles(loads as Load[], year, month, trips as Trip[]).total;
    const n = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= n; day++) {
      const key = dayKey(new Date(Date.UTC(year, month, day)));
      if (!home.has(key)) out++;
    }
  }
  return out > 0 ? miles / out : null;
};

/**
 * The month in progress, measured against the commitment.
 *
 * `homeDays` are the days that HAPPENED at home; `plannedHomeDays` are the ones
 * marked ahead on Per Diem. They are kept apart on purpose — the same rule the
 * cash board follows — so a plan can never rewrite how the month has gone so
 * far, and today's miles are never spread over days nobody has worked yet.
 */
export const monthPace = (
  loads: readonly Load[],
  trips: readonly Trip[],
  homeDays: readonly string[],
  plannedHomeDays: readonly string[],
  today: Date,
  target: number | null,
  trailingMonths = 3,
): Pace => {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const thisMonth = monthKey(today);
  const todayKey = dayKey(today);

  const miles = monthMiles(loads as Load[], year, month, trips as Trip[]).total;
  const daysElapsed = today.getUTCDate();

  const home = new Set(homeDays.map((d) => String(d).slice(0, 10)));
  let homeSoFar = 0;
  for (let day = 1; day <= daysElapsed; day++) {
    if (home.has(dayKey(new Date(Date.UTC(year, month, day))))) homeSoFar++;
  }
  const daysOut = Math.max(0, daysElapsed - homeSoFar);
  const milesPerDayOut = daysOut > 0 ? miles / daysOut : null;

  // Days still to come, less the ones already promised to home. A planned day
  // ON or BEFORE today is not "still to come" — it has already been counted as
  // elapsed, and counting it twice would shorten the month.
  const planned = new Set(plannedHomeDays.map((d) => String(d).slice(0, 10)));
  const total = daysInMonth(today);
  let plannedLeft = 0;
  for (let day = daysElapsed + 1; day <= total; day++) {
    const key = dayKey(new Date(Date.UTC(year, month, day)));
    if (planned.has(key) && key > todayKey && key.slice(0, 7) === thisMonth) plannedLeft++;
  }
  const daysOutLeft = Math.max(0, total - daysElapsed - plannedLeft);

  const landsAt = milesPerDayOut == null ? null : miles + milesPerDayOut * daysOutLeft;

  // The months behind this one, most recent first, for the trailing pace.
  const prior: { year: number; month: number }[] = [];
  for (let i = 1; i <= trailingMonths; i++) {
    const d = new Date(Date.UTC(year, month - i, 1));
    prior.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }

  const usableTarget = target != null && target > 0 ? target : null;
  return {
    miles,
    target: usableTarget,
    pctOfTarget: usableTarget == null ? null : miles / usableTarget,
    daysElapsed,
    daysOut,
    milesPerDayOut,
    trailingPerDayOut: perDayOutOver(loads, trips, homeDays, prior),
    daysOutLeft,
    landsAt,
    landsAtPctOfTarget: usableTarget == null || landsAt == null ? null : landsAt / usableTarget,
  };
};

/**
 * The floor a given month's mileage implies — fixed cost spread over those
 * miles, plus the variable cost a mile incurs, grossed up by the keep.
 *
 * This is the pace card's WARNING, never a price. The ladder keeps quoting the
 * committed figure; this only says what the month is really tracking toward, so
 * the decision to chase miles or accept a thinner month stays the operator's.
 */
export const floorAtMiles = (
  fixedMonthly: number | null,
  variablePerMile: number | null,
  keep: number,
  miles: number | null,
): number | null => {
  if (fixedMonthly == null || variablePerMile == null) return null;
  if (miles == null || miles <= 0 || keep <= 0) return null;
  return (fixedMonthly / miles + variablePerMile) / keep;
};
