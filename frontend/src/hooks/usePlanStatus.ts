import { useMemo } from "react";
import type { Load } from "@/types/load";
import { readPlanStatus } from "@/lib/metrics/planRead";
import { useLocalTodayKey } from "./useLocalToday";
import type { OwnerFeedsState } from "./useOwnerFeeds";

// The Plan page's standing read for the landing page: status = getPlanStatus(
// snapInput(latest), planInput, { accrual, accrualMoved }) — the one call
// StatusPage makes for its own badge and cards (lib/metrics/planRead.ts), fed
// by the shared owner feeds. `failed` names what didn't load; Retry refetches.
export const usePlanStatus = (
  feeds: OwnerFeedsState,
  loads: Load[],
) => {
  const today = useLocalTodayKey();
  const { plans, accounts, snapshots, opsChecks, obligations, fuelEntries, trips, services, loading, failed, retry } = feeds;
  const read = useMemo(
    () =>
      loading
        ? null
        : readPlanStatus({ today, plans, accounts, snapshots, opsChecks, obligations, loads, fuelEntries, trips, services }),
    [loading, today, plans, accounts, snapshots, opsChecks, obligations, loads, fuelEntries, trips, services],
  );
  return {
    status: read?.status ?? null,
    plan: read?.plan ?? null,
    latestSnapshot: read?.latest ?? null,
    obligById: read?.obligById ?? null,
    // What the cards print beside the floors: the Tax account's typed balance
    // (null = not typed, never $0) and the Ops number's source when an OPS NOW
    // check is newer than the snapshot.
    taxBalance: read ? read.balanceOf(read.latest, read.taxAcct?.account_id) : null,
    vaultBalance: read ? read.balanceOf(read.latest, read.vaultAcct?.account_id) : null,
    opsCheckDate: read?.opsFromCheck ? read.opsFromCheck.as_of.slice(0, 10) : null,
    loading,
    failed,
    retry,
  };
};
