// The grind meter — a week-over-week motivation layer. Each pay-week is graded
// on your WEEKLY GROSS PACE from freight actually HAULED (delivered/earned): did
// it beat your weekly target (green), clear the break-even floor (amber), or fall
// short (red)? A week you delivered no freight is a home/neutral week (grey) — it
// doesn't count, but it doesn't break your streak either. The streak is
// consecutive target-beating weeks. Booked-but-unhauled freight is committed
// pipeline (shown on the rate-targets card), not a win here until it's delivered.
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import {
  payWeekRange,
  getWeekEarnedGross,
  getGrossTargets,
  getCostBasis,
  type GrossTargets,
} from "./rateTargets";
import {
  MARGIN_GOAL,
  PAY_WEEK_START_DOW,
  WORKING_DAYS_PER_MONTH,
} from "@/lib/constants/targets";

const WEEK_MS = 7 * 86400000;

export type WeekStatus = "target" | "breakeven" | "below" | "home";

export interface GrindWeek {
  start: string; // 'YYYY-MM-DD'
  status: WeekStatus;
  gross: number;
}

export interface Grind {
  weeks: GrindWeek[]; // last N complete weeks, oldest → newest (the strip)
  currentStreak: number; // consecutive target weeks (home skips, else breaks)
  bestStreak: number;
  thisWeek: WeekStatus; // the in-progress week
  thisWeekGross: number;
  hasLadder: boolean; // false when there's no P&L to build gross targets from
}

// Grade a week's gross against the weekly pace targets. Zero freight = home.
export const classify = (gross: number, targets: GrossTargets): WeekStatus => {
  if (gross <= 0) return "home";
  if (targets.weeklyTarget != null && gross >= targets.weeklyTarget) return "target";
  if (targets.weeklyBreakEven != null && gross >= targets.weeklyBreakEven) return "breakeven";
  return "below";
};

// Consecutive target weeks from the most recent backward; home weeks skip
// (neither extend nor break), anything else stops the run.
export const currentStreakOf = (statuses: WeekStatus[]): number => {
  let s = 0;
  for (let i = statuses.length - 1; i >= 0; i--) {
    if (statuses[i] === "home") continue;
    if (statuses[i] === "target") s++;
    else break;
  }
  return s;
};

// Longest target run across all weeks; home weeks are neutral (don't reset).
export const bestStreakOf = (statuses: WeekStatus[]): number => {
  let best = 0;
  let run = 0;
  for (const st of statuses) {
    if (st === "home") continue;
    if (st === "target") {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
};

const medianOf = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The shared core: grade every pay-week from the earliest delivery to now against
// a target set, and roll up the streaks. Both grinds — the owner's cost target and
// a dispatcher's personal pace — flow through here so they render identically.
const grindFrom = (
  loads: Load[],
  targets: GrossTargets,
  now: Date,
  weeksToShow: number,
  hasLadder: boolean,
): Grind => {
  const current = payWeekRange(now, PAY_WEEK_START_DOW);
  const thisWeekGross = getWeekEarnedGross(loads, current.start, current.end);
  const thisWeek: WeekStatus = hasLadder ? classify(thisWeekGross, targets) : "home";

  const delivered = loads.filter(
    (l) => l.load_status === "delivered" && l.delivery_date,
  );
  if (!hasLadder || delivered.length === 0)
    return { weeks: [], currentStreak: 0, bestStreak: 0, thisWeek, thisWeekGross, hasLadder };

  let earliest = delivered[0].delivery_date!;
  for (const l of delivered)
    if (l.delivery_date! < earliest) earliest = l.delivery_date!;
  const firstStart = payWeekRange(
    new Date(earliest.slice(0, 10) + "T00:00:00Z"),
    PAY_WEEK_START_DOW,
  ).start;

  const weeks: GrindWeek[] = [];
  for (let t = firstStart.getTime(); t < current.start.getTime(); t += WEEK_MS) {
    const ws = new Date(t);
    const gross = getWeekEarnedGross(loads, ws, new Date(t + WEEK_MS));
    weeks.push({ start: ws.toISOString().slice(0, 10), status: classify(gross, targets), gross });
    if (weeks.length > 200) break; // safety cap
  }

  const statuses = weeks.map((w) => w.status);
  const currentStreak = currentStreakOf(statuses);

  return {
    weeks: weeks.slice(-weeksToShow),
    currentStreak,
    bestStreak: Math.max(bestStreakOf(statuses), currentStreak),
    thisWeek,
    thisWeekGross,
    hasLadder,
  };
};

export const computeGrind = (
  loads: Load[],
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  now: Date,
  marginGoal: number = MARGIN_GOAL,
  weeksToShow = 14,
): Grind => {
  const basis = getCostBasis(periods, obligationsMonthly, loads, now);
  const targets = getGrossTargets(
    basis.trueMonthlyCost,
    marginGoal,
    WORKING_DAYS_PER_MONTH,
  );
  return grindFrom(loads, targets, now, weeksToShow, targets.weeklyTarget != null);
};

// A dispatcher's grind, graded against HER OWN typical week instead of the shop's
// cost target — so the streak is winnable and genuinely hers. "Typical" is the
// median of her active (non-zero) weekly booked gross over the trailing quarter,
// so the bar tracks the current season, not an all-time average. A week at ≥ 75%
// of that keeps the streak hot; an off week (nothing delivered) stays neutral.
export const PERSONAL_SOLID = 0.75; // ≥ this share of a typical week = a "target" week
export const PERSONAL_FLOOR = 0.4; // below this share = a "below" week
const TYPICAL_WINDOW_WEEKS = 13; // ~ a quarter — the seasonal window for "typical"
const MIN_ACTIVE_WEEKS = 3; // need a few weeks before a personal bar is meaningful

export const computePersonalGrind = (
  mine: Load[],
  now: Date,
  weeksToShow = 14,
): Grind => {
  const empty: Grind = {
    weeks: [], currentStreak: 0, bestStreak: 0, thisWeek: "home", thisWeekGross: 0, hasLadder: false,
  };
  const delivered = mine.filter((l) => l.load_status === "delivered" && l.delivery_date);
  if (delivered.length === 0) return empty;

  let earliest = delivered[0].delivery_date!;
  for (const l of delivered)
    if (l.delivery_date! < earliest) earliest = l.delivery_date!;
  const firstStart = payWeekRange(
    new Date(earliest.slice(0, 10) + "T00:00:00Z"),
    PAY_WEEK_START_DOW,
  ).start;
  const current = payWeekRange(now, PAY_WEEK_START_DOW);

  // Her active weekly grosses over the trailing quarter → the seasonal "typical".
  const windowStart = current.start.getTime() - TYPICAL_WINDOW_WEEKS * WEEK_MS;
  const active: number[] = [];
  for (let t = firstStart.getTime(); t < current.start.getTime(); t += WEEK_MS) {
    if (t < windowStart) continue;
    const g = getWeekEarnedGross(mine, new Date(t), new Date(t + WEEK_MS));
    if (g > 0) active.push(g);
  }
  const typical = medianOf(active);
  const hasLadder = typical != null && typical > 0 && active.length >= MIN_ACTIVE_WEEKS;
  const targets: GrossTargets = {
    weeklyBreakEven: typical != null ? typical * PERSONAL_FLOOR : null,
    weeklyTarget: typical != null ? typical * PERSONAL_SOLID : null,
    dailyBreakEven: null,
    dailyTarget: null,
  };
  return grindFrom(mine, targets, now, weeksToShow, hasLadder);
};
