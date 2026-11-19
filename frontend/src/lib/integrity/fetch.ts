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
import { getRole } from "@/lib/roles";
import type { IntegrityInputs } from "./issue";

// Every input the integrity checks read, fetched the way the pages fetch it.
// Shared by the Integrity page (hooks/useIntegrity) and the morning run
// (scripts/integrityReport), so the report on the phone and the report on the
// page are built from one loader and one set of checks.

// What a failed fetch is called on the page — "Couldn't load the loads — …".
export type Fetched = Omit<IntegrityInputs, "today" | "role" | "basis">;

const EMPTY: Fetched = {
  loads: [], trips: [], fuel: [], settlements: [], settlementLines: [], periods: [],
  financials: [], obligations: [], accessorials: [], payRates: [], schedule: null, perDiemRates: [], splits: [],
  snapshots: [], accounts: [], plan: null, assumptions: null, services: [],
};

// Every statement line in one read (GET /settlements/lines, stage 4d).
const fetchSettlementLines = async (): Promise<Fetched["settlementLines"]> => getAllSettlementLines();

export interface Loaded {
  data: Fetched;
  failed: string[];
}

// A fresh account has no settlement schedule yet and the API 404s — not a failure.
const scheduleOrNull = () =>
  getSettlementSchedule().catch((err) => {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  });

export const loadAll = async (): Promise<Loaded> => {
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

// The inputs the checks read: the fetched data plus the day, the viewer's role
// and the cost basis the rate ladder stands on.
export const toInputs = (data: Fetched, today: string, role: string | null): IntegrityInputs => {
  const basis = computeRateTargets(
    data.loads,
    data.periods,
    monthlyObligationCost(data.obligations),
    data.schedule,
    anchorDay(today),
    data.trips,
    data.splits ? splitInForce(data.splits, today) : null,
  ).basis;
  return { ...data, today, role, basis };
};

export const loadIntegrityInputs = async (
  now: Date = new Date(),
): Promise<{ inputs: IntegrityInputs; failed: string[] }> => {
  const { data, failed } = await loadAll();
  return { inputs: toInputs(data, localDayKey(now), getRole()), failed };
};
