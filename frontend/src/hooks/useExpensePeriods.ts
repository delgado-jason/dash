import { useEffect, useState } from "react";
import type { ExpensePeriod, CategorySpend } from "@/types/expense";
import {
  getExpensePeriods,
  getExpenseCategoryRollup,
} from "@/services/expensesService";

// P&L data for the Money tab: the period list (aggregates — feeds the monthly
// P&L chart, margin trend, and YTD KPIs) plus the current year's spending rolled
// up by category (the backend does the GROUP BY) for the "where it goes" card.
// Newest-first.
export const useExpensePeriods = () => {
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [categoriesYTD, setCategoriesYTD] = useState<CategorySpend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const year = new Date().getUTCFullYear();
    (async () => {
      try {
        const [list, cats] = await Promise.all([
          getExpensePeriods(),
          getExpenseCategoryRollup(year),
        ]);
        if (!alive) return;
        setPeriods(
          [...list].sort((a, b) => (a.period_month < b.period_month ? 1 : -1)),
        );
        setCategoriesYTD(cats);
      } catch {
        /* leave empty — the tab shows an empty state */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { periods, categoriesYTD, loading };
};
