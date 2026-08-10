// THE BURN — what a day costs parked vs rolling (Jason, 2026-08-10). Sit is
// the bleed that doesn't care whether the truck moves: fixed operating costs
// plus the notes. Run adds the variable burn — fuel, repairs, the road. The
// gap between them is what a working day costs ON TOP of existing, which is
// the number a marginal load is actually weighed against. Daily uses the mean
// Gregorian month (30.44 days), weekly its week count (4.345) — same
// conventions as the page's weekly-cost figure, so run/week always equals it.

export const DAYS_PER_MONTH = 30.44;
export const WEEKS_PER_MONTH = 4.345;

export interface SitRun {
  sitMonthly: number;
  runMonthly: number;
  sitDaily: number;
  sitWeekly: number;
  runDaily: number;
  runWeekly: number;
  roadDaily: number; // run − sit: what the road itself costs per day
}

export const sitRunCosts = (
  fixedMonthly: number,
  variableMonthly: number,
  notesMonthly: number,
): SitRun => {
  const sitMonthly = fixedMonthly + notesMonthly;
  const runMonthly = sitMonthly + variableMonthly;
  return {
    sitMonthly,
    runMonthly,
    sitDaily: sitMonthly / DAYS_PER_MONTH,
    sitWeekly: sitMonthly / WEEKS_PER_MONTH,
    runDaily: runMonthly / DAYS_PER_MONTH,
    runWeekly: runMonthly / WEEKS_PER_MONTH,
    roadDaily: variableMonthly / DAYS_PER_MONTH,
  };
};
