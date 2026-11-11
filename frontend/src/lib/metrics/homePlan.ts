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

// ---- The six-month road's weeks-off, measured instead of typed (call 3) ----
//
// `forecast_adjustments.weeks_off` is a per-month decimal Jason types. The same
// fact is now recorded day by day on the Per Diem calendar, so he was telling
// dash the same thing twice — and the two disagree. Read off prod 2026-11-10:
// October typed 2.00 against EIGHTEEN marked home days (2.57 weeks), and July
// and August carry 1 and 8 home days with no typed figure at all, so the
// baseline has been treating two part-months as full ones.
//
// WHICH DAYS COUNT DEPENDS ON WHICH WAY THE MONTH FACES, and the sheet did not
// separate these. `weeksOffByMonth` does two different jobs in `buildForecast`:
//   · a PAST month corrects the per-week baseline — how many weeks the money
//     actually came from. That wants the days he WAS home: actual marks.
//   · a FUTURE month reduces projected income. That wants the days he INTENDS
//     to be home: planned marks.
// Mixing them would let a plan rewrite history, or history forecast the future.
//
// The typed figure is not thrown away. A month with no marks at all keeps it —
// Jason has 1.00 typed against December with nothing yet marked, and deriving
// strictly would silently drop a plan he made. Measured beats typed; typed
// beats nothing.
export const weeksOffByMonth = (
  actualHomeDays: readonly string[],
  plannedHomeDays: readonly string[],
  typed: ReadonlyMap<string, number>,
  monthsOfInterest: readonly string[],
): Map<string, number> => {
  const count = (days: readonly string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const d of days) {
      const key = `${String(d).slice(0, 7)}-01`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  };
  const actual = count(actualHomeDays);
  const planned = count(plannedHomeDays);

  const out = new Map<string, number>();
  for (const month of monthsOfInterest) {
    const key = `${String(month).slice(0, 7)}-01`;
    // A month can hold both — the one he is living through right now has days
    // behind it and days ahead. Both are days he is not earning, so both count.
    const marked = (actual.get(key) ?? 0) + (planned.get(key) ?? 0);
    if (marked > 0) out.set(key, Math.round((marked / 7) * 100) / 100);
    else {
      const t = typed.get(key);
      if (t != null && t > 0) out.set(key, t);
    }
  }
  return out;
};

/** Was this month's figure measured from the calendar, or typed by hand? */
export const weeksOffIsDerived = (
  month: string,
  actualHomeDays: readonly string[],
  plannedHomeDays: readonly string[],
): boolean => {
  const key = String(month).slice(0, 7);
  return [...actualHomeDays, ...plannedHomeDays].some((d) => String(d).slice(0, 7) === key);
};

// ---- What a fortnight at home costs, and what moving it costs (call 4) ----
//
// The finding the sheet turned on, and the one Jason cannot get anywhere else:
// his bills CLUSTER. The truck note (26th), the guarantee fee (27th), the
// trailer (27th) and the phone (29th) all draft in the last week of the month.
// So the same two weeks off cost $4,767 taken Dec 2–15 and $7,727 taken
// Dec 16–29 — $2,959 for the identical fortnight, moved.
//
// It is a decision he makes several times a year and nothing in dash has ever
// priced it.
export interface FortnightOption {
  /** How many weeks later than the chosen start, e.g. −1, 0, +1. */
  shift: number;
  weeks: PayWeek[];
  cost: HomeCost;
  /** Against the chosen fortnight. Negative = cheaper. */
  delta: number;
}

/**
 * Price a stretch of pay weeks, and the same stretch moved a week either way.
 *
 * `weekAt(n)` returns the pay week n weeks after the chosen start — the caller
 * owns the calendar, so this stays pure and the pay-week rule lives in one
 * place.
 */
export const fortnightOptions = (
  weekAt: (offset: number) => PayWeek,
  weeksLong: number,
  weeklyPayroll: number | null,
  billsInWeek: (week: PayWeek) => number,
  shifts: readonly number[] = [-1, 0, 1],
): FortnightOption[] => {
  const priced = shifts.map((shift) => {
    const weeks = Array.from({ length: Math.max(1, weeksLong) }, (_, i) => weekAt(shift + i));
    return { shift, weeks, cost: homeCost(weeks, weeklyPayroll, billsInWeek) };
  });
  const chosen = priced.find((p) => p.shift === 0)?.cost.total ?? 0;
  return priced.map((p) => ({
    ...p,
    delta: Math.round((p.cost.total - chosen) * 100) / 100,
  }));
};

/** The cheapest of the options, for the one-line verdict. */
export const cheapest = (options: readonly FortnightOption[]): FortnightOption | null =>
  options.length === 0
    ? null
    : options.reduce((a, b) => (b.cost.total < a.cost.total ? b : a));
