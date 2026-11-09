import { useState, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { depositForWeek, type DepositLine } from "@/lib/metrics/cashBoard";
import { payWeekOf } from "@/lib/metrics/payWeeks";
import { addDays } from "@/lib/metrics/odometer";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useOwnerFeeds } from "@/hooks/useOwnerFeeds";
import { useCashBoard } from "@/hooks/useCashBoard";
import { usePlanStatus } from "@/hooks/usePlanStatus";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useIntegrity } from "@/hooks/useIntegrity";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
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
  // The chip in the statusbar: what is open for THIS viewer (none while loading).
  const integrity = useIntegrity();
  // The operator's local day, anchored, rolling at midnight (call 13).
  const now = useLocalToday();
  const alerts = [...useMaintenanceAlerts(loads), ...useComplianceAlerts()];
  // The rows the landing page reads beyond the loads: one fetch, shared by the
  // cash board (the Cash Flow page's own input, assembled by the same builder)
  // and the plan's standing (the Plan page's own read).
  const feeds = useOwnerFeeds();
  const { board, input: boardInput, today: todayKey } = useCashBoard(feeds, loads);
  const plan = usePlanStatus(feeds, loads);
  // The next deposit, by the cash board's own rule (2026-11-04, call 11): the
  // statement's actual when the vault has it, else delivered loads at net −
  // the advance − the bucket − what earlier statements carried, dated
  // settlement + lag. Last period's deposit if it lands today or later, else
  // this period's — on the FULL board input (the typed overrides count).
  const nextDeposit = useMemo<DepositLine | null>(() => {
    if (!boardInput) return null;
    const cur = payWeekOf(todayKey);
    const prev = { start: addDays(cur.start, -7), end: addDays(cur.end, -7) };
    const last = depositForWeek(boardInput, prev);
    return last.date >= todayKey ? last : depositForWeek(boardInput, cur);
  }, [boardInput, todayKey]);
  // The latest FINISHED recap that actually has data — never the in-progress one.
  const latestRecap = latestRecapWithData(loads, now);
  // `?awarddemo` on the dashboard previews the celebration UI on demand.

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
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <OpsStatusbar targets={targets} integrityOpen={integrity.loading ? 0 : integrity.visible.length} />
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
            <PulseTab loads={loads} trips={trips} targets={targets} alerts={alerts} feeds={feeds} cash={{ board, floatLine: boardInput?.floatLine ?? null }} plan={plan} nextDeposit={nextDeposit} />
          ) : active === "money" ? (
            <MoneyTab loads={loads} trips={trips} targets={targets} marginGoal={targets.marginGoal ?? null} obligationsMonthly={targets.obligationsMonthly} />
          ) : active === "lanes" ? (
            <LanesTab loads={loads} />
          ) : active === "agents" ? (
            <AgentsTab loads={loads} ladder={targets.bookingLadder} />
          ) : (
            <FleetTab loads={loads} pnlCostPerMile={targets.basis.costPerTotalMile} pnlWindow={targets.basis.windowLabel} />
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
