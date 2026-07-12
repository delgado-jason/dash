import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import {
  getCostBasis,
  getRateLadder,
  getGrossTargets,
  payWeekRange,
  getWeekBookedGross,
  getWeekEarnedGross,
  getWeekRpm,
  getWindowRpm,
} from "@/lib/metrics/rateTargets";
import {
  RATE_TIERS,
  WORKING_DAYS_PER_MONTH,
  PAY_WEEK_START_DOW,
} from "@/lib/constants/targets";

// Assembles the rate ladder + weekly/daily pace targets from the P&L,
// obligations, and loads. Break-even is blended over the last 3 complete
// months (see getCostBasis); everything hangs off that true cost.
export const useRateTargets = (loads: Load[]) => {
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getExpensePeriods().catch(() => [] as ExpensePeriod[]),
      getObligations().catch(() => [] as Obligation[]),
    ]).then(([ps, obs]) => {
      if (!active) return;
      setPeriods(ps);
      setObligations(obs);
    });
    return () => {
      active = false;
    };
  }, []);

  const obligationsMonthly = useMemo(
    () => obligations.filter((o) => o.active).reduce((s, o) => s + o.amount, 0),
    [obligations],
  );

  return useMemo(() => {
    const now = new Date();
    const basis = getCostBasis(periods, obligationsMonthly, loads, now);
    const ladder = getRateLadder(basis.breakEvenRpm, RATE_TIERS);
    const gross = getGrossTargets(
      basis.trueMonthlyCost,
      RATE_TIERS.target,
      WORKING_DAYS_PER_MONTH,
    );
    const { start, end } = payWeekRange(now, PAY_WEEK_START_DOW);
    const weekBooked = getWeekBookedGross(loads, start, end); // committed (all non-cancelled)
    const weekEarned = getWeekEarnedGross(loads, start, end); // delivered only
    const weekRpm = getWeekRpm(loads, start, end);
    const rollingRpm = getWindowRpm(loads, now);
    return {
      basis,
      ladder,
      gross,
      weekBooked, // committed this week — booked + in-transit + delivered
      weekEarned, // earned this week — delivered only; drives the "hit target" win
      weekRpm, // this week's blended rate — the ladder marker
      rollingRpm, // rolling 3-complete-month RPM — the Avg RPM KPI
      weekStart: start,
      weekEnd: end,
      ready: basis.breakEvenRpm != null,
    };
  }, [periods, obligationsMonthly, loads]);
};
