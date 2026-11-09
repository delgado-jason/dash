// Weekly verdicts — each pay week graded on its GROSS from freight actually
// HAULED (delivered): at or above the weekly target, above the break-even
// floor, or short of it; a week with nothing delivered is a home week. The
// target and floor are the hero's own (computeRateTargets: six months, divided
// by the keep), so every surface grades the same number (2026-11-04, §5).
// The heat meter and the streaks that rode these verdicts left with the game
// layer (the Redesign, phase B); what remains is the grading and the quarter's
// plain count. `bestStreakOf` stays for the recap engine's record line.
import type { Load } from "@/types/load";
import { payWeekRange, getWeekGrossEarned, type GrossTargets } from "./rateTargets";
import { PAY_WEEK_START_DOW } from "@/lib/constants/targets";
import { quarterOf } from "./quarterOf";

const WEEK_MS = 7 * 86400000;

export type WeekStatus = "target" | "breakeven" | "below" | "home";

// Grade a week's gross against the weekly pace targets. Zero freight = home.
export const classify = (gross: number, targets: GrossTargets): WeekStatus => {
  if (gross <= 0) return "home";
  if (targets.weeklyTarget != null && gross >= targets.weeklyTarget) return "target";
  if (targets.weeklyBreakEven != null && gross >= targets.weeklyBreakEven) return "breakeven";
  return "below";
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

// ---- the quarter's weeks as one plain count (the Cockpit, call 11; the
// Redesign, B1) ----
// Of the COMPLETED pay weeks that started inside the current calendar quarter
// and delivered freight: how many earned gross at or above the weekly
// break-even floor, and how many reached the weekly target. A week that
// delivered nothing is a home week — counted in neither figure, but named. The
// week in progress never counts. The bars are the pace meter's own
// (computeRateTargets' gross weekly target and floor), so "over break-even" here
// and "target" on the meter are the same two numbers.
export interface QuarterWeeks {
  label: string; // "Q4 2026"
  counted: number; // completed weeks in the quarter that delivered freight
  overFloor: number; // of those, at or above the weekly break-even
  atTarget: number; // of those, at or above the weekly target
  home: number; // completed weeks in the quarter with nothing delivered
  hasBars: boolean; // false with no floor/target (no P&L yet): nothing is graded
}

export const quarterWeekVerdicts = (
  loads: Load[],
  targets: GrossTargets,
  now: Date,
): QuarterWeeks => {
  const q = quarterOf(now);
  const current = payWeekRange(now, PAY_WEEK_START_DOW);
  const hasBars = targets.weeklyBreakEven != null && targets.weeklyTarget != null;
  // The first pay week that STARTS inside the quarter; a week straddling the
  // quarter line belongs to the quarter it started in.
  let t = payWeekRange(q.start, PAY_WEEK_START_DOW).start.getTime();
  if (t < q.start.getTime()) t += WEEK_MS;
  let counted = 0;
  let overFloor = 0;
  let atTarget = 0;
  let home = 0;
  for (; t < current.start.getTime(); t += WEEK_MS) {
    const gross = getWeekGrossEarned(loads, new Date(t), new Date(t + WEEK_MS));
    if (gross <= 0) {
      home++;
      continue;
    }
    counted++;
    if (!hasBars) continue;
    const status = classify(gross, targets);
    if (status === "target") {
      atTarget++;
      overFloor++;
    } else if (status === "breakeven") overFloor++;
  }
  return { label: q.label, counted, overFloor, atTarget, home, hasBars };
};
