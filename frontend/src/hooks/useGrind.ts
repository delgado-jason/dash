import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { computeGrind, type Grind } from "@/lib/metrics/grind";

// Fetches the P&L + obligations the rate ladder needs, then grades every pay-week
// into the grind streak. Null until there's data.
export const useGrind = (loads: Load[]): Grind | null => {
  const [periods, setPeriods] = useState<ExpensePeriod[] | null>(null);
  const [obligations, setObligations] = useState<Obligation[] | null>(null);

  useEffect(() => {
    getExpensePeriods().then(setPeriods).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
  }, []);

  return useMemo(() => {
    if (!periods || !obligations || loads.length === 0) return null;
    const obligationsMonthly = obligations
      .filter((o) => o.active)
      .reduce((s, o) => s + Number(o.amount), 0);
    return computeGrind(loads, periods, obligationsMonthly, new Date());
  }, [periods, obligations, loads]);
};
