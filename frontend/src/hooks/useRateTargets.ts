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
    const bookingBase =
      basis.costPerTotalMile != null && linehaulTake > 0
        ? basis.costPerTotalMile / linehaulTake
        : null;
    const bookingLadder = getRateLadder(bookingBase, RATE_TIERS);

    // Weekly/daily GROSS to book = monthly cost grossed up by your keep, spread over
    // the pay-week / working day, plus the target markup.
    const bookingCost =
      basis.trueMonthlyCost != null && linehaulTake > 0
        ? basis.trueMonthlyCost / linehaulTake
        : null;
    const gross = getGrossTargets(
      bookingCost,
      RATE_TIERS.target,
      WORKING_DAYS_PER_MONTH,
    );
    // Weekly MINIMUM (+15%) and STRONG (+60%) tiers — the extra ticks on the pace
    // bar (floor · min · target · strong).
    const weeklyMinimum =
      gross.weeklyBreakEven != null
        ? gross.weeklyBreakEven * (1 + RATE_TIERS.minimum)
        : null;
    const weeklyStrong =
      gross.weeklyBreakEven != null
        ? gross.weeklyBreakEven * (1 + RATE_TIERS.strong)
        : null;

    // This week's gross booked (committed) + gross delivered (earned).
    const weekBooked = getWeekGrossCommitted(loads, start, end);
    const weekEarned = getWeekGrossEarned(loads, start, end);

    const rollingRpm = getWindowRpm(loads, now); // net RPM — the Avg RPM KPI
    return {
      basis,
      gross, // weekly/daily GROSS dollars to book (break-even + target)
      weeklyMinimum, // weekly +15% tier (gross)
      weeklyStrong, // weekly +60% stretch tier (gross)
      weekBooked, // this week's gross committed (booked + in-transit + delivered)
      weekEarned, // this week's gross earned (delivered only)
      rollingRpm,
      linehaulTake,
      bookingLadder, // gross rate to book per mile driven (walk-away/target/strong)
      grossRate: basis.grossPerTotalMile, // your gross rate/mile — the ladder marker
      weekStart: start,
      weekEnd: end,
      ready: basis.breakEvenRpm != null,
    };
  }, [periods, obligationsMonthly, loads, schedule]);
};
