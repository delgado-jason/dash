// ONE sit/run burn. The fixed/variable split blended over the cost basis
// window's full periods (the ones with lines), plus the monthly notes. The
// Expenses page's "sit vs run" tiles and the landing's leave reserve both read
// this function, so a parked week costs the same on both pages.
import type { ExpensePeriod } from "@/types/expense";
import { getExpenseMetrics } from "./expenses";
import { sitRunCosts, type SitRun } from "./sitRun";

export const burnFromPeriods = (
  windowFull: readonly ExpensePeriod[],
  obligationsTotal: number,
): SitRun | null => {
  if (windowFull.length === 0) return null;
  let fixed = 0;
  let variable = 0;
  for (const p of windowFull) {
    const m = getExpenseMetrics(p, 0, 0);
    fixed += m.fixedTotal;
    variable += m.variableTotal;
  }
  const n = windowFull.length;
  return sitRunCosts(fixed / n, variable / n, obligationsTotal);
};
