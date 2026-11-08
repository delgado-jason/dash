import { useEffect, useMemo, useState } from "react";
import type { ExpensePeriod } from "@/types/expense";
import { getExpensePeriod } from "@/services/expensesService";

// The cost basis window's FULL periods (the ones with lines), so the sit/run
// burn blends the fixed/variable split over the same months the per-mile
// figures blend. Lifted from the Expenses page for the landing's leave
// reserve; the arithmetic on top of it is lib/metrics/sitCost.burnFromPeriods,
// one function for both pages. `failed` is visible, never a quiet empty list.
const NO_PERIODS: ExpensePeriod[] = [];

export const useBasisWindow = (
  periods: readonly ExpensePeriod[],
  monthsDetail: readonly { year: number; month: number }[],
  refreshKey = 0,
): { windowFull: ExpensePeriod[]; loading: boolean; failed: boolean; retry: () => void } => {
  const [tick, setTick] = useState(0);
  const windowIds = useMemo(() => {
    const keys = new Set(monthsDetail.map((m) => `${m.year}-${String(m.month + 1).padStart(2, "0")}`));
    return periods.filter((p) => keys.has(String(p.period_month).slice(0, 7))).map((p) => p.period_id);
  }, [periods, monthsDetail]);
  const [state, setState] = useState<{ ids: string; periods: ExpensePeriod[]; failed: boolean }>({
    ids: "",
    periods: NO_PERIODS,
    failed: false,
  });
  const key = windowIds.join(",");
  useEffect(() => {
    let active = true;
    if (windowIds.length === 0) return;
    Promise.all(windowIds.map((pid) => getExpensePeriod(pid)))
      .then((ps) => {
        if (active) setState({ ids: key, periods: ps, failed: false });
      })
      .catch(() => {
        if (active) setState({ ids: key, periods: NO_PERIODS, failed: true });
      });
    return () => {
      active = false;
    };
  }, [windowIds, key, refreshKey, tick]);
  // Derived, not set in the effect: no window → no months; a stale window
  // (the ids moved under us) → loading until the fetch for the new ids lands.
  const current = windowIds.length === 0 ? NO_PERIODS : state.ids === key ? state.periods : NO_PERIODS;
  const loading = windowIds.length > 0 && state.ids !== key;
  return {
    windowFull: current,
    loading,
    failed: state.ids === key && state.failed,
    retry: () => setTick((t) => t + 1),
  };
};
