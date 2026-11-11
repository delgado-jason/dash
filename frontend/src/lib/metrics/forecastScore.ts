// Did the forecast hold?
//
// Phase 2 of "Does the forecast hold?" (nodded 2026-11-09). Phase 1 measures
// the typed assumptions; this measures the BOARD. A projection is captured
// once while it is still a projection (migration 108) and scored here against
// what actually landed.
//
// ACTUALS ARE NEVER STORED. They are read live from the Ops checks, so a
// corrected snapshot re-scores the history instead of freezing a wrong answer
// into it. The cost is that scoring depends on him keying a balance — which he
// does every Friday anyway, and a period with no reading says so rather than
// guessing.
import type { CashCheck } from "./cashBoard";

export interface ForecastRecord {
  pay_week_start: string;
  pay_week_end: string;
  forecast_ending: number | string | null;
  forecast_deposit: number | string | null;
  forecast_fuel: number | string | null;
  days_before_end: number;
  recorded_at: string;
}

export interface ScoredPeriod {
  start: string;
  end: string;
  forecast: number | null;
  actual: number | null;
  /** actual − forecast. Positive = the board was pessimistic. */
  miss: number | null;
  /** How early the forecast was taken. */
  daysBefore: number;
  /** Why it could not be scored, when it could not. */
  unscored: "no-forecast" | "no-reading" | null;
}

export interface ForecastScore {
  periods: ScoredPeriod[];
  scored: number;
  /** Mean miss across scored periods. Null until there is one. */
  averageMiss: number | null;
  /** Mean miss as a fraction of the forecast. Null when no forecast had size. */
  averagePct: number | null;
  /** Below this the average is shown but called thin. */
  thin: boolean;
}

/** Eight periods is two months — enough for an average to mean something. */
export const ENOUGH = 8;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const day = (v: string): string => String(v).slice(0, 10);

// A pay period's real ending is the first balance he typed ON or AFTER the day
// it closed. Not the last one inside the period: the board's Ending is struck
// after the period's own bills have drafted, and a Friday reading mid-week has
// not seen them yet.
//
// The window matters. A reading three weeks later has absorbed a whole other
// period's worth of money and is not this period's ending by any honest
// reading, so beyond `withinDays` the period is simply unscored.
export const actualEnding = (
  end: string,
  checks: readonly CashCheck[],
  withinDays = 10,
): number | null => {
  const e = day(end);
  const limit = new Date(new Date(`${e}T00:00:00Z`).getTime() + withinDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const after = checks
    .map((c) => ({ ...c, date: day(c.date) }))
    .filter((c) => c.date >= e && c.date <= limit && Number.isFinite(Number(c.balance)))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return after.length === 0 ? null : round2(Number(after[0].balance));
};

export const scoreForecasts = (
  records: readonly ForecastRecord[],
  checks: readonly CashCheck[],
  today: string,
  limit = ENOUGH,
): ForecastScore => {
  const closed = records
    .filter((r) => day(r.pay_week_end) < day(today))
    .sort((a, b) => (a.pay_week_start < b.pay_week_start ? 1 : -1))
    .slice(0, limit);

  const periods: ScoredPeriod[] = closed.map((r) => {
    const forecast = num(r.forecast_ending);
    const actual = actualEnding(r.pay_week_end, checks);
    const unscored: ScoredPeriod["unscored"] =
      forecast == null ? "no-forecast" : actual == null ? "no-reading" : null;
    return {
      start: day(r.pay_week_start),
      end: day(r.pay_week_end),
      forecast,
      actual,
      miss: unscored == null ? round2(actual! - forecast!) : null,
      daysBefore: r.days_before_end,
      unscored,
    };
  });

  const misses = periods.filter((p) => p.miss != null);
  const sized = misses.filter((p) => p.forecast != null && Math.abs(p.forecast) > 0);
  return {
    periods,
    scored: misses.length,
    averageMiss:
      misses.length === 0 ? null : round2(misses.reduce((s, p) => s + p.miss!, 0) / misses.length),
    // Percent is averaged PER PERIOD, not as (total miss ÷ total forecast). A
    // single huge period would otherwise dominate a figure meant to describe
    // how far off a typical week runs.
    averagePct:
      sized.length === 0
        ? null
        : sized.reduce((s, p) => s + p.miss! / Math.abs(p.forecast!), 0) / sized.length,
    thin: misses.length > 0 && misses.length < ENOUGH,
  };
};
