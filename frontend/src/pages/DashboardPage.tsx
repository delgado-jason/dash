import { useEffect, useState, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getSettlements } from "@/services/settlementsService";
import { getFuelEntries } from "@/services/fuelService";
import { getCashAssumptions, type CashAssumptionsRow } from "@/services/cashflowService";
import { depositForWeek, runningWeekPace, type CashBoardInput, type DepositLine } from "@/lib/metrics/cashBoard";
import { deductionBuckets } from "@/lib/metrics/settlements";
import { payWeekOf } from "@/lib/metrics/payWeeks";
import { addDays } from "@/lib/metrics/odometer";
import { dayKey as localDayKey } from "@/lib/perDiem";
import type { SettlementSummary } from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { useAwardPops } from "@/hooks/useAwardPops";
import { AwardPopHost } from "@/components/celebrations/AwardPopHost";
import { DEMO_AWARDS } from "@/lib/metrics/awards";
import { latestRecapWithData } from "@/lib/metrics/recap";
import { MarketChip } from "@/components/dashboard/MarketChip";
import { OpsStatusbar } from "@/components/dashboard/OpsStatusbar";
import { DashboardShell, type DashTab } from "@/components/dashboard/DashboardShell";
import { AgentsTab } from "@/components/dashboard/agents/AgentsTab";
import { PulseTab } from "@/components/dashboard/PulseTab";
import { MoneyTab } from "@/components/dashboard/MoneyTab";
import { LanesTab } from "@/components/dashboard/LanesTab";
import { FleetTab } from "@/components/dashboard/FleetTab";
import { isDispatcher } from "@/lib/roles";
import DispatchDashboard from "./DispatchDashboard";

const DASH_TABS: DashTab[] = [
  { key: "pulse", label: "Pulse" },
  { key: "money", label: "Money" },
  { key: "lanes", label: "Lanes" },
  { key: "agents", label: "Agents" },
  { key: "fleet", label: "Fleet" },
];

const OwnerDashboard = () => {
  const [refreshKey] = useState(0);
  const {
    loads,
    isLoading: loadsLoading,
    error: loadsError,
  } = useLoads(refreshKey);
  const {
    trips,
    isLoading: tripsLoading,
    error: tripsError,
  } = useTrips(refreshKey);
  const targets = useRateTargets(loads);
  const alerts = [...useMaintenanceAlerts(loads), ...useComplianceAlerts()];
  // Settlement day drives the "next settlement lands Wed…" beat on Pulse.
  const [settlementDay, setSettlementDay] = useState<number | null>(null);
  const [depositLag, setDepositLag] = useState<number>(1);
  const [settlements, setSettlements] = useState<SettlementSummary[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [assumptions, setAssumptions] = useState<CashAssumptionsRow | null>(null);
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => {
        setSettlementDay(s.settlement_day);
        setDepositLag(s.deposit_lag_days ?? 1);
      })
      .catch(() => {});
    getSettlements().then(setSettlements).catch(() => {});
    getFuelEntries().then(setFuelEntries).catch(() => {});
    getCashAssumptions().then(setAssumptions).catch(() => {});
  }, []);
  // The next deposit, by the cash board's own rule (2026-11-04, call 11): the
  // statement's actual when the vault has it, else delivered loads at net −
  // the advance − the bucket − what earlier statements carried, dated
  // settlement + lag. The old tile summed unpaid loads at net and named the
  // statement day — about $2,688 high and a day early on Nov 4.
  const nextDeposit = useMemo<DepositLine | null>(() => {
    if (settlementDay == null || !assumptions) return null;
    const today = localDayKey(new Date());
    const cur = payWeekOf(today);
    const prev = { start: addDays(cur.start, -7), end: addDays(cur.end, -7) };
    const raw = assumptions.weekly_fuel_advance;
    const adv = raw == null || raw === "" || !Number.isFinite(Number(raw)) ? 2000 : Number(raw);
    const input: CashBoardInput = {
      today, settlementDay, depositLagDays: depositLag, floatLine: null, checks: [], loads, settlements, fuelEntries,
      obligations: [], readings: [], weeklyPayroll: 0, perMile: 0,
      fuelPaceWeekly: runningWeekPace(fuelEntries, today), fuelFallback: adv, advanceDefault: adv,
      buckets: deductionBuckets(settlements), deductionsFallback: Number(assumptions.weekly_settlement_deductions ?? 0),
      weeklyRevenueFallback: Number(assumptions.weekly_revenue), moneyDays: [], overrides: {},
    };
    const last = depositForWeek(input, prev);
    return last.date >= today ? last : depositForWeek(input, cur);
  }, [settlementDay, depositLag, assumptions, loads, settlements, fuelEntries]);
  const { pops, truckAvatarUrl } = useAwardPops(loads);
  // The latest FINISHED recap that actually has data — never the in-progress one.
  const latestRecap = latestRecapWithData(loads, new Date());
  // `?awarddemo` on the dashboard previews the celebration UI on demand.
  const awardDemo = window.location.search.includes("awarddemo");

  const isLoading = loadsLoading || tripsLoading;
  const error = loadsError || tripsError;

  if (isLoading)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <Skeleton className="h-8 w-40 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" style={{ borderRadius: 13 }} />
          ))}
        </div>
        <Skeleton className="h-28 mt-6" style={{ borderRadius: 13 }} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <Skeleton className="h-56 lg:col-span-2" style={{ borderRadius: 13 }} />
          <Skeleton className="h-56" style={{ borderRadius: 13 }} />
        </div>
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  // Full-bleed per the approved mockup: canvas to the very top, the sidebar
  // trigger inside the statusbar, content in the 1180px operations column.
  return (
    <div className="min-h-screen text-ink font-body">
      <AwardPopHost pops={awardDemo ? DEMO_AWARDS : pops} truckAvatarUrl={truckAvatarUrl} />
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <OpsStatusbar loads={loads} trips={trips} targets={targets} />
        <div className="mt-4">
          <DashboardShell
        tabs={DASH_TABS}
        right={
          <>
            <MarketChip />
            <Link
              to="/recap"
              className="text-sm text-status-info-text hover:underline whitespace-nowrap"
            >
              {latestRecap ? `${latestRecap.label} ` : ""}recap →
            </Link>
          </>
        }
      >
        {(active) =>
          active === "pulse" ? (
            <PulseTab loads={loads} trips={trips} targets={targets} alerts={alerts} settlementDay={settlementDay} nextDeposit={nextDeposit} />
          ) : active === "money" ? (
            <MoneyTab loads={loads} trips={trips} marginGoal={targets.marginGoal ?? null} obligationsMonthly={targets.obligationsMonthly} />
          ) : active === "lanes" ? (
            <LanesTab loads={loads} />
          ) : active === "agents" ? (
            <AgentsTab loads={loads} />
          ) : (
            <FleetTab loads={loads} />
          )
        }
          </DashboardShell>
        </div>
      </div>
    </div>
  );
};

// The owner sees the full financial dashboard; a dispatcher gets her own
// operational board (no net revenue / RPM / P&L). Role is fixed for the
// session, so the branch is stable across renders.
const DashboardPage = () =>
  isDispatcher() ? <DispatchDashboard /> : <OwnerDashboard />;

export default DashboardPage;
