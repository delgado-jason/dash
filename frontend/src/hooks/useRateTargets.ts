import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import {
  getCostBasis,
  getRateLadder,
  getGrossTargets,
  payWeekRange,
  getWeekGrossCommitted,
  getWeekGrossEarned,
  getWindowRpm,
} from "@/lib/metrics/rateTargets";
import {
  tiersFrom,
  specTiersFrom,
  marginGoalFrom,
  WORKING_DAYS_PER_MONTH,
  PAY_WEEK_START_DOW,
} from "@/lib/constants/targets";

// Assembles the rate ladder + weekly/daily pace targets from the P&L,
// obligations, and loads. Break-even is blended over the last 3 complete
// months (see getCostBasis); everything hangs off that true cost.
export const useRateTargets = (loads: Load[]) => {
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getExpensePeriods().catch(() => [] as ExpensePeriod[]),
      getObligations().catch(() => [] as Obligation[]),
      getSettlementSchedule().catch(() => null),
    ]).then(([ps, obs, sch]) => {
      if (!active) return;
      setPeriods(ps);
      setObligations(obs);
      setSchedule(sch);
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
    // Your linehaul take (linehaul % + trailer %). 1 = own authority / unconfigured.
    const linehaulTake = schedule
      ? Number(schedule.linehaul_pct) + Number(schedule.trailer_pct)
      : 1;
    const { start, end } = payWeekRange(now, PAY_WEEK_START_DOW);

    // ---- The whole rate & pace card is in GROSS (booking) dollars — that's the
    // number loads are booked at. Everything below grosses cost up by your keep. ----

    // Ladder: gross rate to book per mile DRIVEN (deadhead folded into total miles)
    // = cost-per-total-mile ÷ keep, scaled by tiers; marker = your gross rate/mile.
    // TWO ladders — standard is the app-wide baseline; specialized is what the
    // Scorer holds oversize/hazmat/heavy freight to.
    const tiers = tiersFrom(schedule);
    const specTiers = specTiersFrom(schedule);
    const marginGoal = marginGoalFrom(schedule);
    const bookingBase =
      basis.costPerTotalMile != null && linehaulTake > 0
        ? basis.costPerTotalMile / linehaulTake
        : null;
    const bookingLadder = getRateLadder(bookingBase, tiers);
    const specLadder = getRateLadder(bookingBase, specTiers);

    // Weekly/daily GROSS revenue targets = monthly cost grossed up by your keep,
    // spread over the pay-week / working day, lifted to your MARGIN goal. The
    // margin goal is a total-revenue KPI, independent of the per-mile rate tiers.
    const bookingCost =
      basis.trueMonthlyCost != null && linehaulTake > 0
        ? basis.trueMonthlyCost / linehaulTake
        : null;
    const gross = getGrossTargets(
      bookingCost,
      marginGoal,
      WORKING_DAYS_PER_MONTH,
    );

    // This week's gross booked (committed) + gross delivered (earned).
    const weekBooked = getWeekGrossCommitted(loads, start, end);
    const weekEarned = getWeekGrossEarned(loads, start, end);

    const rollingRpm = getWindowRpm(loads, now); // net RPM — the Avg RPM KPI
    return {
      basis,
      gross, // weekly/daily GROSS revenue targets (break-even + margin goal)
      marginGoal, // target profit margin driving those revenue targets
      weekBooked, // this week's gross committed (booked + in-transit + delivered)
      weekEarned, // this week's gross earned (delivered only)
      rollingRpm,
      linehaulTake,
      bookingLadder, // STANDARD gross rate to book per mile driven (walk/target/strong)
      specLadder, // SPECIALIZED ladder — oversize/hazmat/heavy
      grossRate: basis.grossPerTotalMile, // your gross rate/mile — the ladder marker
      weekStart: start,
      weekEnd: end,
      tiers, // standard markup tiers (Scorer default + downstream)
      specTiers, // specialized markup tiers (Scorer, for specialized loads)
      ready: basis.breakEvenRpm != null,
    };
  }, [periods, obligationsMonthly, loads, schedule]);
};
