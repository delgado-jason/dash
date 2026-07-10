import { useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { KpiCard } from "@/components/KpiCard";
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
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { RateTargetsCard } from "@/components/dashboard/RateTargetsCard";
import { RevenueChart } from "@/components/RevenueChart";
import { RpmChart } from "@/components/RpmChart";
import { OutstandingLoadsList } from "@/components/OutstandingLoadsList";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { TopAgents } from "@/components/dashboard/TopAgents";
import { WhatsNext } from "@/components/dashboard/WhatsNext";
import { RecentLoads } from "@/components/dashboard/RecentLoads";

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

const DashboardPage = () => {
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
  const alerts = useMaintenanceAlerts(loads);

  const isLoading = loadsLoading || tripsLoading;
  const error = loadsError || tripsError;

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen">
        <p className="text-muted-text">Loading dashboard...</p>
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
  const outstanding = getOutstandingLoads(loads);
  const topAgents = getTopAgentsByRevenue(loads);
  const upcoming = getUpcomingLoads(loads);
  const recentLoads = getRecentDeliveredLoads(loads);

  // ---- threshold-based status ----
  // Live break-even (true cost ÷ loaded miles, last 3 complete months); falls
  // back to the constant until there's enough P&L history.
  const liveBreakEven = targets.ladder.walkAway ?? BREAK_EVEN_RPM;
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
      <h1 className="text-3xl font-condensed mb-6">Dashboard</h1>

      <AlertBanners alerts={alerts} />

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Revenue · MTD"
          value={formatCurrency(revenueMTD)}
          delta={mtdDelta}
        />
        <KpiCard label="Revenue · YTD" value={formatCurrency(revenueYTD)} />
        <KpiCard
          label="Avg RPM · 3mo"
          value={formatRpm(avgRpm)}
          status={rpmStatus}
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
        <RateTargetsCard targets={targets} rpm={targets.weekRpm} />
      </div>

      {/* Revenue chart + top agents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <RevenueChart data={monthlyRevenue} />
        </div>
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-2">
            Top 5 agents · last 90 days
          </p>
          <TopAgents agents={topAgents} />
        </div>
      </div>

      {/* RPM chart + what's next */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <RpmChart data={monthlyRpm} breakEven={liveBreakEven} />
        </div>
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-2">What's next · booked</p>
          <WhatsNext loads={upcoming} />
        </div>
      </div>

      {/* Recent loads + outstanding */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-2">Recent loads</p>
          <RecentLoads loads={recentLoads} />
        </div>
        <OutstandingLoadsList loads={outstanding} />
      </div>
    </div>
  );
};

export default DashboardPage;
