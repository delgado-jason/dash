import { useCallback, useEffect, useState } from "react";
import { getPlans, getAccounts, getSnapshots, getOpsChecks } from "@/services/planService";
import type { PlanRow, AccountRow, SnapshotRow, OpsCheckRow } from "@/services/planService";
import { getObligations } from "@/services/obligationsService";
import { getExpensePeriods } from "@/services/expensesService";
import { getSettlements } from "@/services/settlementsService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import { getCashAssumptions, type CashAssumptionsRow } from "@/services/cashflowService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getHomeDays, getPlannedHomeDays } from "@/services/perDiemService";
import type { Obligation } from "@/types/obligation";
import type { ExpensePeriod } from "@/types/expense";
import type { SettlementSummary } from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import type { MaintenanceService } from "@/types/maintenance";
import type { SettlementSchedule } from "@/types/settlementSchedule";

// The rows the owner's landing page needs beyond the loads it already holds:
// the cash board, the plan's standing and the pace card all read from this one
// fetch, so the same endpoints are never asked twice for one page. allSettled, not
// all: one flaky call must not throw away the rest — and a failed call is NAMED
// (`failed`), never swallowed into an emptier page.
export interface OwnerFeeds {
  plans: PlanRow[];
  accounts: AccountRow[];
  snapshots: SnapshotRow[];
  opsChecks: OpsCheckRow[];
  obligations: Obligation[];
  periods: ExpensePeriod[];
  settlements: SettlementSummary[];
  fuelEntries: FuelEntry[];
  trips: Trip[];
  services: MaintenanceService[];
  assumptions: CashAssumptionsRow | null; // null = no row yet (a fresh account), not a failure
  schedule: SettlementSchedule | null; // null = none on file (a 404) — the house defaults apply
  // The days at home — the ones that HAPPENED and the ones marked ahead, kept
  // apart the way the cash board keeps them. The pace card divides this
  // month's miles by the days NOT at home, so a fortnight home can never make
  // the driving look lazy.
  homeDays: string[];
  plannedHomeDays: string[];
}

const EMPTY: OwnerFeeds = {
  plans: [], accounts: [], snapshots: [], opsChecks: [], obligations: [], periods: [],
  settlements: [], fuelEntries: [], trips: [], services: [], assumptions: null, schedule: null,
  homeDays: [], plannedHomeDays: [],
};

const is404 = (e: unknown): boolean => (e as { response?: { status?: number } } | null)?.response?.status === 404;

interface State {
  data: OwnerFeeds;
  failed: string[]; // what didn't load, in the owner's words
  loading: boolean;
}

const fetchAll = async (): Promise<State> => {
  const names = [
    "the plan", "the accounts", "the Friday snapshots", "the OPS NOW checks", "the obligations", "the P&L",
    "the settlements", "the fuel log", "the trip log", "the shop log", "the cash assumptions", "the settlement schedule",
    "the home days", "the planned home days",
  ];
  const r = await Promise.allSettled([
    getPlans(), getAccounts(), getSnapshots(), getOpsChecks(), getObligations(), getExpensePeriods(),
    getSettlements(), getFuelEntries(), getTrips(), getMaintenanceServices(), getCashAssumptions(),
    getSettlementSchedule(), getHomeDays(), getPlannedHomeDays(),
  ]);
  const failed: string[] = [];
  r.forEach((x, i) => {
    // The schedule 404s harmlessly for a fresh account; every other failure is flagged.
    if (x.status === "rejected" && !(i === 11 && is404(x.reason))) failed.push(names[i]);
  });
  const ok = <T,>(i: number, fallback: T): T => (r[i].status === "fulfilled" ? ((r[i] as PromiseFulfilledResult<T>).value ?? fallback) : fallback);
  return {
    failed,
    loading: false,
    data: {
      plans: ok(0, EMPTY.plans), accounts: ok(1, EMPTY.accounts), snapshots: ok(2, EMPTY.snapshots),
      opsChecks: ok(3, EMPTY.opsChecks), obligations: ok(4, EMPTY.obligations), periods: ok(5, EMPTY.periods),
      settlements: ok(6, EMPTY.settlements), fuelEntries: ok(7, EMPTY.fuelEntries), trips: ok(8, EMPTY.trips),
      services: ok(9, EMPTY.services), assumptions: ok<CashAssumptionsRow | null>(10, null),
      schedule: ok<SettlementSchedule | null>(11, null),
      homeDays: ok(12, EMPTY.homeDays), plannedHomeDays: ok(13, EMPTY.plannedHomeDays),
    },
  };
};

export type OwnerFeedsState = OwnerFeeds & { loading: boolean; failed: string[]; retry: () => void };

export const useOwnerFeeds = (): OwnerFeedsState => {
  const [state, setState] = useState<State>({ data: EMPTY, failed: [], loading: true });

  useEffect(() => {
    let alive = true;
    fetchAll().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fetchAll().then(setState);
  }, []);

  return { ...state.data, loading: state.loading, failed: state.failed, retry };
};
