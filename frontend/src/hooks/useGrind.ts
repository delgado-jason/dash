import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { computeGrind, computePersonalGrind, type Grind } from "@/lib/metrics/grind";
import { monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { useLocalToday } from "./useLocalToday";
import { useSplitToday } from "./useSplitToday";

// Fetches the P&L + obligations + schedule the one basis needs, then grades
// every pay-week into the grind streak against the hero's own gross target
// (computeRateTargets, 2026-11-04). Null until there's data. `now` is the
// operator's local day and rolls at midnight (call 13).
export const useGrind = (loads: Load[]): Grind | null => {
  const [periods, setPeriods] = useState<ExpensePeriod[] | null>(null);
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const split = useSplitToday();
  const now = useLocalToday();

  useEffect(() => {
    getExpensePeriods().then(setPeriods).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
    getSettlementSchedule().then(setSchedule).catch(() => {});
  }, []);

  return useMemo(() => {
    if (!periods || !obligations || loads.length === 0) return null;
    const obligationsMonthly = monthlyObligationCost(obligations);
    return computeGrind(loads, periods, obligationsMonthly, schedule, now, 14, split);
  }, [periods, obligations, loads, schedule, now, split]);
};

// A dispatcher's personal-pace grind — graded against her own typical week, so no
// P&L is needed. Null until she has enough booking history for a bar.
export const usePersonalGrind = (mine: Load[]): Grind | null => {
  const now = useLocalToday();
  return useMemo(() => (mine.length > 0 ? computePersonalGrind(mine, now) : null), [mine, now]);
};
