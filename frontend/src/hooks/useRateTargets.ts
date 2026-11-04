import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { computeRateTargets, monthlyObligationCost, type RateTargets } from "@/lib/metrics/rateTargets";
import { useLocalToday } from "./useLocalToday";

// THE one basis lives in lib/metrics/rateTargets (computeRateTargets) since
// 2026-11-04, so the metric modules can share it; re-exported here for the
// pages that import it from the hook file.
export { computeRateTargets, type RateTargets };

// Assembles the rate ladder + weekly/daily pace targets from the P&L,
// obligations, and loads. Break-even is blended over the last BASIS_MONTHS
// complete months (see getCostBasis); everything hangs off that true cost.
// `now` is the operator's local day, and it rolls at midnight (call 13).
export const useRateTargets = (loads: Load[]) => {
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const now = useLocalToday();

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
    () => computeRateTargets(loads, periods, obligationsMonthly, schedule, now),
    [periods, obligationsMonthly, loads, schedule, now],
  );
};
