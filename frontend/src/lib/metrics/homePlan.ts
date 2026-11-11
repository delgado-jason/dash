// How much of a pay week Jason PLANS to be home — and therefore how much of a
// normal week's money the board should project for it.
//
// NOT `hometime.ts`, which sits beside this one and answers a different
// question: how long since he was last home, and is he overdue. That one looks
// backwards at days that happened; this one looks forward at days he intends.
// (The names differ only in case, which on a case-insensitive filesystem is no
// difference at all — this module is `homePlan` for that reason.)
//
// Until now the cash board has forecast every week as a working week: a full
// week's revenue, a full week's fuel, a full week's advance. It has never
// known when he is home, because the only record of home time —
// `per_diem_days` — is a TAX record and has never held a day in the future.
// So a fortnight off projects roughly $9,300 of revenue he will not earn,
// against fuel he will not buy. The two errors run opposite ways and partly
// cancel, which is why the ending has always looked almost reasonable while
// both halves were wrong. (Nod Sheet "Home Time And The Forecast", 2026-11-09.)
//
// WHY A SHARE AND NOT A FLAG. The sheet drew a binary planned home WEEK, with
// the deposit, the fuel and the advance struck through. A flag needs a
// threshold — is four days home a home week? five? — and any threshold is a
// number nobody can defend. The share needs none: seven planned days zero the
// week exactly as drawn, and a partial week scales instead of having to be
// ruled one way or the other. On the real case the two agree, because Jason
// takes WEEKS off, not Tuesdays. Named as a refinement of call 2 in the PR.
import type { PayWeek } from "./payWeeks";

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" → the next day's key, in UTC so no zone can shift it. */
const nextDay = (key: string): string =>
  new Date(new Date(`${key}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

/**
 * The days of a pay week, inclusive of both ends. A pay week is seven days,
 * but this walks the real span rather than assuming it, so a schedule change
 * cannot silently divide by the wrong number.
 */
export const daysOfWeek = (week: PayWeek): string[] => {
  const out: string[] = [];
  let d = String(week.start).slice(0, 10);
  const end = String(week.end).slice(0, 10);
  // A guard, not a limit: a malformed week must not spin forever.
  for (let i = 0; i < 31 && d <= end; i++) {
    out.push(d);
    d = nextDay(d);
  }
  return out;
};

/**
 * The fraction of a pay week Jason plans to be ON THE ROAD: 1 when nothing is
 * planned, 0 when every day of it is. Projections multiply by this.
 *
 * Only PLANNED days count. A day he actually was home is history and is
 * already in the week's real loads and real fills; scaling by it as well would
 * discount a week twice.
 */
export const onRoadShare = (week: PayWeek, plannedHomeDays: readonly string[]): number => {
  const days = daysOfWeek(week);
  if (days.length === 0) return 1;
  const planned = new Set(plannedHomeDays.map((d) => String(d).slice(0, 10)));
  const home = days.filter((d) => planned.has(d)).length;
  return (days.length - home) / days.length;
};

/** Every day of the week is planned home — the case the sheet drew. */
export const isHomeWeek = (week: PayWeek, plannedHomeDays: readonly string[]): boolean =>
  onRoadShare(week, plannedHomeDays) === 0;

/**
 * What a stretch at home actually costs: the obligations that do not care
 * where the truck is. Payroll drafts every week and the bills draft on their
 * day of the month, so the SAME fortnight costs different money depending on
 * where it falls — Jason's bills cluster in the last week of the month, and
 * the sheet measured a $2,959 swing between an early and a late December
 * fortnight. That is the number worth knowing before choosing a week.
 */
export interface HomeCost {
  /** The weeks covered, in order. */
  weeks: { week: PayWeek; bills: number; payroll: number; out: number }[];
  /** Everything that drafts across the whole stretch. */
  total: number;
}

export const homeCost = (
  weeks: readonly PayWeek[],
  weeklyPayroll: number | null,
  billsInWeek: (week: PayWeek) => number,
): HomeCost => {
  const pay = weeklyPayroll == null || !Number.isFinite(weeklyPayroll) ? 0 : weeklyPayroll;
  const rows = weeks.map((week) => {
    const bills = billsInWeek(week);
    const out = Math.round((bills + pay) * 100) / 100;
    return { week, bills, payroll: pay, out };
  });
  return {
    weeks: rows,
    total: Math.round(rows.reduce((s, r) => s + r.out, 0) * 100) / 100,
  };
};
