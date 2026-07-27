import { useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { Link } from "react-router-dom";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { BREAK_EVEN_RPM, DEADHEAD_TARGET } from "@/lib/constants/targets";
import {
  getRevenueMTD,
  getRevenueLastMonth,
  getRevenueYTD,
  getMonthlyDeadhead,
  getMonthlyRevenue,
  getMonthlyRPM,
  getOutstandingLoads,
  getLoadsMonthly,
  getTopAgentsByRevenue,
  getUpcomingLoads,
  getRecentDeliveredLoads,
} from "@/lib/metrics/dashboard";
import {
  computeHonors,
  currentQuarterStandings,
} from "@/lib/metrics/agentLeaderboard";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { useAwardPops } from "@/hooks/useAwardPops";
import { AwardPopHost } from "@/components/comic/AwardPopHost";
import { DEMO_AWARDS } from "@/lib/metrics/awards";
import { latestRecapWithData } from "@/lib/metrics/recap";
import { RateTargetsCard } from "@/components/dashboard/RateTargetsCard";
import { MarketChip } from "@/components/dashboard/MarketChip";
import { GrindMeter } from "@/components/dashboard/GrindMeter";
import { RevenueChart } from "@/components/RevenueChart";
import { RpmChart } from "@/components/RpmChart";
import { OutstandingLoadsList } from "@/components/OutstandingLoadsList";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { TopAgents } from "@/components/dashboard/TopAgents";
import { WhatsNext } from "@/components/dashboard/WhatsNext";
import { RecentLoads } from "@/components/dashboard/RecentLoads";
import { isDispatcher } from "@/lib/roles";
import DispatchDashboard from "./DispatchDashboard";

// helpers
const formatCurrency = (n: number | null): string =>
  n === null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatRpm = (n: number | null): string =>
  n === null ? "—" : `$${n.toFixed(2)}`;

const formatPercent = (ratio: number | null): string =>
  ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;

const computeDelta = (current: number | null, previous: number | null) => {
  if (current === null || previous === null || previous === 0) return null;
  const percent = ((current - previous) / previous) * 100;
  return {
    percent,
    direction: percent >= 0 ? ("up" as const) : ("down" as const),
  };
};

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

  // ---- compute KPI values ----
  const revenueMTD = getRevenueMTD(loads);
  const revenueLastMonth = getRevenueLastMonth(loads);
  const revenueYTD = getRevenueYTD(loads);
  const avgRpm = targets.rollingRpm; // rolling 3-complete-month blended RPM
  const deadhead = getMonthlyDeadhead(loads, trips);
  const loadsMonthly = getLoadsMonthly(loads);

  const mtdDelta = computeDelta(revenueMTD, revenueLastMonth);
  const loadsDelta = computeDelta(loadsMonthly.thisMonth, loadsMonthly.lastMonth);
  const monthlyRevenue = getMonthlyRevenue(loads);
  const monthlyRpm = getMonthlyRPM(loads);
  const revenueTrend = monthlyRevenue.map((d) => d.revenue);
  const rpmTrend = monthlyRpm
    .map((d) => d.rpm)
    .filter((r): r is number => r != null);
  const outstanding = getOutstandingLoads(loads);
  const topAgents = getTopAgentsByRevenue(loads);
  const now = new Date();
  const agentHonors = computeHonors(loads, now);
  const agentStandings = currentQuarterStandings(loads, now);
  const upcoming = getUpcomingLoads(loads);
  const recentLoads = getRecentDeliveredLoads(loads);

  // ---- threshold-based status ----
  // Live break-even (true cost ÷ loaded miles, last 3 complete months); falls
  // back to the constant until there's enough P&L history.
  const liveBreakEven = targets.basis.breakEvenRpm ?? BREAK_EVEN_RPM;
  const rpmStatus =
    avgRpm === null ? "neutral" : avgRpm >= liveBreakEven ? "good" : "bad";
  const deadheadStatus =
    deadhead.thisMonth === null
      ? "neutral"
      : deadhead.thisMonth <= DEADHEAD_TARGET
        ? "good"
        : "bad"; // inverted: low is good

  return (
    <div className="p-6 bg-iron text-light min-h-screen font-body">
      <AwardPopHost pops={awardDemo ? DEMO_AWARDS : pops} truckAvatarUrl={truckAvatarUrl} />

      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-3xl font-condensed">Dashboard</h1>
        <div className="flex items-center gap-3">
          <MarketChip />
          <Link
            to="/recap"
            className="text-sm text-status-info-text hover:underline whitespace-nowrap"
          >
            Your {latestRecap ? `${latestRecap.label} ` : ""}recap →
          </Link>
        </div>
      </div>

      <AlertBanners alerts={alerts} />

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Net revenue · MTD"
          value={formatCurrency(revenueMTD)}
          delta={mtdDelta}
        />
        <KpiCard
          label="Net revenue · YTD"
          value={formatCurrency(revenueYTD)}
          trend={revenueTrend}
        />
        <KpiCard
          label="Net RPM · 3mo"
          value={formatRpm(avgRpm)}
          status={rpmStatus}
          trend={rpmTrend}
          subtext={
            avgRpm === null
              ? undefined
              : `${avgRpm >= liveBreakEven ? "above" : "below"} $${liveBreakEven.toFixed(2)} break-even`
          }
        />
        <KpiCard
          label="Deadhead · MTD"
          value={formatPercent(deadhead.thisMonth)}
          status={deadheadStatus}
          subtext={`Last month: ${formatPercent(deadhead.lastMonth)}`}
        />
        <KpiCard
          label="Loads · MTD"
          value={String(loadsMonthly.thisMonth)}
          delta={loadsDelta}
        />
      </div>

      {/* Rate & pace targets */}
      <div className="mt-6">
        <RateTargetsCard targets={targets} />
      </div>

      {/* The grind — weekly target-beating streak */}
      <div className="mt-6">
        <GrindMeter loads={loads} />
      </div>

      {/* Revenue chart + top agents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <RevenueChart data={monthlyRevenue} />
        </div>
        <TopAgents
          agents={topAgents}
          honors={agentHonors}
          standings={agentStandings}
        />
      </div>

      {/* RPM chart + what's next */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <RpmChart data={monthlyRpm} breakEven={liveBreakEven} />
        </div>
        <Panel noir className="p-4">
          <p className="text-xs text-muted-text mb-2">What's next · booked</p>
          <WhatsNext loads={upcoming} />
        </Panel>
      </div>

      {/* Recent loads + outstanding */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Panel noir className="p-4">
          <p className="text-xs text-muted-text mb-2">Recent loads</p>
          <RecentLoads loads={recentLoads} />
        </Panel>
        <OutstandingLoadsList loads={outstanding} />
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
