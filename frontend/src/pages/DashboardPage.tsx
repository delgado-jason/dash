import { useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { useAwardPops } from "@/hooks/useAwardPops";
import { AwardPopHost } from "@/components/comic/AwardPopHost";
import { DEMO_AWARDS } from "@/lib/metrics/awards";
import { latestRecapWithData } from "@/lib/metrics/recap";
import { MarketChip } from "@/components/dashboard/MarketChip";
import { DashboardShell, TabStub, type DashTab } from "@/components/dashboard/DashboardShell";
import { AgentsTab } from "@/components/dashboard/agents/AgentsTab";
import { PulseTab } from "@/components/dashboard/PulseTab";
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
  const { pops, truckAvatarUrl } = useAwardPops(loads);
  // The latest FINISHED recap that actually has data — never the in-progress one.
  const latestRecap = latestRecapWithData(loads, new Date());
  // `?awarddemo` on the dashboard previews the celebration UI on demand.
  const awardDemo = window.location.search.includes("awarddemo");

  const isLoading = loadsLoading || tripsLoading;
  const error = loadsError || tripsError;

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
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
      <div className="p-6 bg-iron text-light min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  return (
    <div className="p-6 bg-iron text-light min-h-screen font-body">
      <AwardPopHost pops={awardDemo ? DEMO_AWARDS : pops} truckAvatarUrl={truckAvatarUrl} />
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
            <PulseTab loads={loads} trips={trips} targets={targets} alerts={alerts} />
          ) : active === "money" ? (
            <TabStub
              title="Money"
              blurb="Your profitability at a glance."
              points={[
                "Pay-week earned vs target + settlement pipeline (no aging)",
                "Revenue trend vs target",
                "Rate vs your break-even floor",
              ]}
            />
          ) : active === "lanes" ? (
            <TabStub
              title="Lanes"
              blurb="Where your freight comes from."
              points={[
                "The granularity map (macro / region / state)",
                "Best lanes and regions",
                "Load-type mix",
              ]}
            />
          ) : active === "agents" ? (
            <AgentsTab loads={loads} />
          ) : (
            <TabStub
              title="Fleet"
              blurb="Asset health."
              points={[
                "Truck / driver utilization",
                "Fuel MPG trend",
                "Next service due",
              ]}
            />
          )
        }
      </DashboardShell>
    </div>
  );
};

// The owner sees the full financial dashboard; a dispatcher gets her own
// operational board (no net revenue / RPM / P&L). Role is fixed for the
// session, so the branch is stable across renders.
const DashboardPage = () =>
  isDispatcher() ? <DispatchDashboard /> : <OwnerDashboard />;

export default DashboardPage;
