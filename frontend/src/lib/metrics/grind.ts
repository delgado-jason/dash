// The grind meter — a week-over-week motivation layer. Each pay-week is graded
// on the SAME rate ladder the dashboard uses: did your rate per loaded mile beat
// target (green), just cover break-even (amber), or slip below (red)? A week you
// delivered nothing is a home/neutral week (grey) — it doesn't count, but it
// doesn't break your streak either. The streak is consecutive target-beating
// weeks; home weeks are skipped.
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import {
  payWeekRange,
  getWeekRpm,
  getRateLadder,
  getCostBasis,
  type RateLadder,
} from "./rateTargets";
import { PAY_WEEK_START_DOW, RATE_TIERS } from "@/lib/constants/targets";

const WEEK_MS = 7 * 86400000;

export type WeekStatus = "target" | "breakeven" | "below" | "home";

export interface GrindWeek {
  start: string; // 'YYYY-MM-DD'
  status: WeekStatus;
  rpm: number | null;
}

export interface Grind {
  weeks: GrindWeek[]; // last N complete weeks, oldest → newest (the strip)
  currentStreak: number; // consecutive target weeks (home skips, else breaks)
  bestStreak: number;
  thisWeek: WeekStatus; // the in-progress week
  thisWeekRpm: number | null;
  hasLadder: boolean; // false when there's no P&L to grade against
}

export const classify = (rpm: number | null, ladder: RateLadder): WeekStatus => {
  if (rpm == null) return "home";
  if (ladder.target != null && rpm >= ladder.target) return "target";
  if (ladder.walkAway != null && rpm >= ladder.walkAway) return "breakeven";
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

export const computeGrind = (
  loads: Load[],
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  now: Date,
  weeksToShow = 14,
): Grind => {
  const basis = getCostBasis(periods, obligationsMonthly, loads, now);
  const ladder = getRateLadder(basis.breakEvenRpm, RATE_TIERS);
  const hasLadder = ladder.walkAway != null && ladder.target != null;

  const current = payWeekRange(now, PAY_WEEK_START_DOW);
  const thisWeekRpm = getWeekRpm(loads, current.start, current.end);
  const thisWeek: WeekStatus = hasLadder ? classify(thisWeekRpm, ladder) : "home";

  const delivered = loads.filter(
    (l) => l.load_status === "delivered" && l.delivery_date,
  );
  if (!hasLadder || delivered.length === 0)
    return { weeks: [], currentStreak: 0, bestStreak: 0, thisWeek, thisWeekRpm, hasLadder };

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
    const rpm = getWeekRpm(loads, ws, new Date(t + WEEK_MS));
    weeks.push({ start: ws.toISOString().slice(0, 10), status: classify(rpm, ladder), rpm });
    if (weeks.length > 200) break; // safety cap
  }

  const statuses = weeks.map((w) => w.status);
  const currentStreak = currentStreakOf(statuses);

  return {
    weeks: weeks.slice(-weeksToShow),
    currentStreak,
    bestStreak: Math.max(bestStreakOf(statuses), currentStreak),
    thisWeek,
    thisWeekRpm,
    hasLadder,
  };
};
