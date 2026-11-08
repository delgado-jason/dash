import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getLoads } from "@/services/loadsService";
import { getTrips } from "@/services/tripsService";
import { getFuelEntries } from "@/services/fuelService";
import { getSettlements, getAllSettlementLines } from "@/services/settlementsService";
import { getExpensePeriods } from "@/services/expensesService";
import { getMonthlyFinancials, getCashAssumptions } from "@/services/cashflowService";
import { getObligations } from "@/services/obligationsService";
import { getAllAccessorials } from "@/services/accessorialService";
import { getAccessorialRates } from "@/services/accessorialRateService";
import { getPerDiemRates } from "@/services/perDiemRateService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getSettlementSplits } from "@/services/settlementSplitService";
import { splitInForce } from "@/lib/metrics/splits";
import { getSnapshots, getAccounts, getPlans } from "@/services/planService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import { computeRateTargets, monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { anchorDay, localDayKey } from "@/lib/metrics/today";
import { runIntegrityChecks } from "@/lib/integrity/checks";
import { visibleTo, type IntegrityInputs, type Issue } from "@/lib/integrity/issue";
import { getRole } from "@/lib/roles";

// What a failed fetch is called on the page — "Couldn't load the loads — …".
type Fetched = Omit<IntegrityInputs, "today" | "role" | "basis">;

const EMPTY: Fetched = {
  loads: [], trips: [], fuel: [], settlements: [], settlementLines: [], periods: [],
  financials: [], obligations: [], accessorials: [], payRates: [], schedule: null, perDiemRates: [], splits: [],
  snapshots: [], accounts: [], plan: null, assumptions: null, services: [],
};

// Every statement line in one read (GET /settlements/lines, stage 4d).
const fetchSettlementLines = async (): Promise<Fetched["settlementLines"]> => getAllSettlementLines();

interface Loaded {
  data: Fetched;
  failed: string[];
}

// A fresh account has no settlement schedule yet and the API 404s — not a failure.
const scheduleOrNull = () =>
  getSettlementSchedule().catch((err) => {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  });

const loadAll = async (): Promise<Loaded> => {
  // Each input is settled on its own so one flaky call never discards the rest.
  const loadsP = getLoads();
  const jobs: Array<[string, Promise<unknown>]> = [
    ["the loads", loadsP],
    ["the trips", getTrips()],
    ["the fuel log", getFuelEntries()],
    ["the settlements", getSettlements()],
    ["the settlement lines", loadsP.then(fetchSettlementLines)],
    ["the P&L", getExpensePeriods()],
    ["the monthly financials", getMonthlyFinancials()],
    ["the bills", getObligations()],
    ["the accessorials", getAllAccessorials()],
    ["the pay rates", getAccessorialRates()],
    ["the settlement schedule", scheduleOrNull()],
    ["the snapshots", getSnapshots()],
    ["the accounts", getAccounts()],
    ["the plan", getPlans()],
    ["the planning assumptions", getCashAssumptions()],
    ["the service log", getMaintenanceServices()],
    ["the per-diem rates", getPerDiemRates()],
    ["the settlement splits", getSettlementSplits()],
  ];
  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  const failed: string[] = [];
  const v = <T,>(i: number, fallback: T): T => {
    const r = settled[i];
    if (r.status === "fulfilled") return r.value as T;
    failed.push(jobs[i][0]);
    return fallback;
  };
  const plans = v(13, [] as NonNullable<Fetched["plan"]>[]);
  const data: Fetched = {
    loads: v(0, EMPTY.loads),
    trips: v(1, EMPTY.trips),
    fuel: v(2, EMPTY.fuel),
    settlements: v(3, EMPTY.settlements),
    settlementLines: v(4, EMPTY.settlementLines),
    periods: v(5, EMPTY.periods),
    financials: v(6, EMPTY.financials),
    obligations: v(7, EMPTY.obligations),
    accessorials: v(8, EMPTY.accessorials),
    payRates: v(9, EMPTY.payRates),
    schedule: v(10, null),
    snapshots: v(11, EMPTY.snapshots),
    accounts: v(12, EMPTY.accounts),
    plan: plans.find((p) => p.active) ?? plans[0] ?? null,
    assumptions: v(14, null),
    services: v(15, EMPTY.services),
    perDiemRates: v(16, null), // unknown when the fetch failed — the check is skipped, not fed []
    splits: v(17, null), // the dated pay splits; unknown when the fetch failed
  };
  return { data, failed };
};

// The Integrity report: every input dash reads, fetched in parallel, handed to
// the checks. `visible` is what THIS viewer sees (a dispatcher sees data rows).
export const useIntegrity = () => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [inputs, setInputs] = useState<IntegrityInputs | null>(null);

  const run = useCallback(() => {
    let active = true;
    loadAll().then((result) => {
      if (!active) return;
      const today = localDayKey(new Date());
      const { data } = result;
      const basis = computeRateTargets(
        data.loads,
        data.periods,
        monthlyObligationCost(data.obligations),
        data.schedule,
        anchorDay(today),
        data.trips,
        data.splits ? splitInForce(data.splits, today) : null,
      ).basis;
      setInputs({ ...data, today, role: getRole(), basis });
      setLoaded(result);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => run(), [run]);

  // Retry re-runs the loader from an event handler; the old report stays up
  // until the new one lands.
  const retry = useCallback(() => {
    run();
  }, [run]);

  const issues: Issue[] = useMemo(() => (inputs ? runIntegrityChecks(inputs) : []), [inputs]);
  const visible = useMemo(() => visibleTo(issues), [issues]);

  return {
    issues,
    visible,
    inputs,
    loading: loaded === null,
    failed: loaded?.failed ?? [],
    retry,
  };
};
