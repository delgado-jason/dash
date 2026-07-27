import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { computeGrind, type Grind } from "@/lib/metrics/grind";
import { monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { marginGoalFrom } from "@/lib/constants/targets";

// Fetches the P&L + obligations the rate ladder needs, then grades every pay-week
// into the grind streak. Null until there's data.
export const useGrind = (loads: Load[]): Grind | null => {
  const [periods, setPeriods] = useState<ExpensePeriod[] | null>(null);
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);

  useEffect(() => {
    getExpensePeriods().then(setPeriods).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
    getSettlementSchedule().then(setSchedule).catch(() => {});
  }, []);

  return useMemo(() => {
    if (!periods || !obligations || loads.length === 0) return null;
    const obligationsMonthly = monthlyObligationCost(obligations);
    return computeGrind(loads, periods, obligationsMonthly, new Date(), marginGoalFrom(schedule));
  }, [periods, obligations, loads, schedule]);
};
