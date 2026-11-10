import { useEffect, useMemo, useState } from "react";
import type { Load } from "@/types/load";
import { buildCashBoard, type CashBoard, type CashBoardInput } from "@/lib/metrics/cashBoard";
import { assembleCashBoardInput, depositOverridesOf } from "@/lib/metrics/cashBoardInput";
import { getDepositOverrides } from "@/services/cashflowService";
import { useLocalTodayKey } from "./useLocalToday";
import type { OwnerFeedsState } from "./useOwnerFeeds";

// The cash board for the landing page: the Cash Flow page's own input
// (assembleCashBoardInput) handed to buildCashBoard. Both are null while
// loading or when there is no assumptions row to plan from; the board is also
// null with no Ops number typed yet (the page says which).
export const useCashBoard = (
  feeds: OwnerFeedsState,
  loads: Load[],
): { board: CashBoard | null; input: CashBoardInput | null; today: string } => {
  const today = useLocalTodayKey();
  // The typed deposits are the ACCOUNT's now, not this browser's (v1.268.0),
  // so the plate and the Cash Flow page read the same figure whichever device
  // typed it. A failed fetch is simply no overrides — the board falls back to
  // its projection, which is what it did before any of them existed.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    getDepositOverrides()
      .then((rows) => live && setOverrides(depositOverridesOf(rows)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const { plans, accounts, snapshots, opsChecks, periods, settlements, fuelEntries, trips, services, obligations, assumptions, schedule, loading } = feeds;
  const input = useMemo(() => {
    if (loading || !assumptions) return null;
    return assembleCashBoardInput({
      today, settlementDay: schedule?.settlement_day ?? null, depositLag: schedule?.deposit_lag_days ?? null,
      plans, accounts, snapshots, opsChecks, periods, loads, settlements, fuelEntries, trips, services,
      obligations, assumptions, overrides,
    });
  }, [loading, today, schedule, plans, accounts, snapshots, opsChecks, periods, loads, settlements, fuelEntries, trips, services, obligations, assumptions, overrides]);
  const board = useMemo(() => (input ? buildCashBoard(input) : null), [input]);
  return { board, input, today };
};
