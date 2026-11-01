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
  monthlyObligationCost,
} from "@/lib/metrics/rateTargets";
import {
  tiersFrom,
  specTiersFrom,
  marginGoalFrom,
  WORKING_DAYS_PER_MONTH,
  PAY_WEEK_START_DOW,
  BASIS_MONTHS,
} from "@/lib/constants/targets";

// The rate ladder + weekly/daily pace targets from the P&L, obligations and
// loads — ONE function, so every surface that prices a mile (Dashboard, Market,
// Score a Load, Lanes, Expenses…) stands on the same basis: break-even blended
// over the last BASIS_MONTHS complete months (see getCostBasis), divided by
// the blended keep. The hook below fetches and calls it; a page that already
// holds its own periods/obligations (Expenses) calls it directly, so its
// figures move the moment a month is uploaded or a note is edited.
export const computeRateTargets = (
  loads: Load[],
  periods: ExpensePeriod[],
  obligationsMonthly: number,
  schedule: SettlementSchedule | null,
  now: Date = new Date(),
) => {
  const basis = getCostBasis(periods, obligationsMonthly, loads, now, BASIS_MONTHS);
  // Your linehaul take (linehaul % + trailer %). 1 = own authority / unconfigured.
  const linehaulTake = schedule
    ? Number(schedule.linehaul_pct) + Number(schedule.trailer_pct)
    : 1;
  // Your KEEP — the share of an all-in booked dollar that reaches you. The
  // blended keep measured from the window's own loads (net ÷ gross: 65 + 8%
  // of linehaul, 100% of fuel surcharge, each accessorial at its rate) once
  // the window has gross; the schedule's linehaul take only until it does.
  // Jason judges a load all-in (2026-11-01), so the rate to book divides by
  // what he actually keeps of an all-in dollar — the construction Score a
  // Load has always used. Dividing all gross by the linehaul take took
  // Landstar's cut out of money he keeps in full, ~23¢ a driven mile.
  const blended = basis.payTake != null && basis.payTake > 0 ? basis.payTake : null;
  const keep = blended ?? linehaulTake;
  const keepSource: "blended" | "linehaul" = blended != null ? "blended" : "linehaul";
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
    basis.costPerTotalMile != null && keep > 0 ? basis.costPerTotalMile / keep : null;
  const bookingLadder = getRateLadder(bookingBase, tiers);
  const specLadder = getRateLadder(bookingBase, specTiers);

  // Weekly/daily GROSS revenue targets = monthly cost grossed up by your keep,
  // spread over the pay-week / working day, lifted to your MARGIN goal. The
  // margin goal is a total-revenue KPI, independent of the per-mile rate tiers.
  const bookingCost =
    basis.trueMonthlyCost != null && keep > 0 ? basis.trueMonthlyCost / keep : null;
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
    obligationsMonthly, // active, non-draw monthly notes (principal) — for cash margin
    weekBooked, // this week's gross committed (booked + in-transit + delivered)
    weekEarned, // this week's gross earned (delivered only)
    rollingRpm,
    linehaulTake,
    keep, // the share of an all-in dollar you keep — the ladder's divisor
    keepSource, // "blended" (measured from the window's loads) | "linehaul" (the schedule, until loads land)
    bookingLadder, // STANDARD gross rate to book per mile driven (walk/target/strong)
    specLadder, // SPECIALIZED ladder — oversize/hazmat/heavy
    grossRate: basis.grossPerTotalMile, // your gross rate/mile — the ladder marker
    weekStart: start,
    weekEnd: end,
    tiers, // standard markup tiers (Scorer default + downstream)
    specTiers, // specialized markup tiers (Scorer, for specialized loads)
    ready: basis.breakEvenRpm != null,
  };
};

export type RateTargets = ReturnType<typeof computeRateTargets>;

// Assembles the rate ladder + weekly/daily pace targets from the P&L,
// obligations, and loads. Break-even is blended over the last BASIS_MONTHS
// complete months (see getCostBasis); everything hangs off that true cost.
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
    () => monthlyObligationCost(obligations),
    [obligations],
  );

  return useMemo(
    () => computeRateTargets(loads, periods, obligationsMonthly, schedule),
    [periods, obligationsMonthly, loads, schedule],
  );
};
