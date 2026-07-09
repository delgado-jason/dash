import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { KpiCard } from "@/components/KpiCard";
import { BREAK_EVEN_RPM, DEADHEAD_TARGET } from "@/lib/constants/targets";
import {
  getRevenueMTD,
  getRevenueLastMonth,
  getRevenueYTD,
  getMonthlyDeadhead,
} from "@/lib/metrics/dashboard";
import { getAverageRPM } from "@/lib/metrics/agent";
import { useState } from "react";
import { RevenueChart } from "@/components/RevenueChart";
import { getMonthlyRevenue } from "@/lib/metrics/dashboard";
import { RpmChart } from "@/components/RpmChart";
import { getMonthlyRPM } from "@/lib/metrics/dashboard";
import { OutstandingLoadsList } from "@/components/OutstandingLoadsList";
import { getOutstandingLoads } from "@/lib/metrics/dashboard";

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
  const avgRpm = getAverageRPM(loads);
  const deadhead = getMonthlyDeadhead(loads, trips);

  const mtdDelta = computeDelta(revenueMTD, revenueLastMonth);
  const monthlyRevenue = getMonthlyRevenue(loads);
  const monthlyRpm = getMonthlyRPM(loads);
  const outstanding = getOutstandingLoads(loads);

  // ---- threshold-based status ----
  const rpmStatus =
    avgRpm === null ? "neutral" : avgRpm >= BREAK_EVEN_RPM ? "good" : "bad";
  const deadheadStatus =
    deadhead.thisMonth === null
      ? "neutral"
      : deadhead.thisMonth <= DEADHEAD_TARGET
        ? "good"
        : "bad"; // inverted: low is good

  return (
    <div className="p-6 bg-iron text-light min-h-screen font-body">
      <h1 className="text-3xl font-condensed mb-6">Dashboard</h1>

      {/* KPI STRIP */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Revenue · MTD"
          value={formatCurrency(revenueMTD)}
          delta={mtdDelta}
        />
        <KpiCard label="Revenue · YTD" value={formatCurrency(revenueYTD)} />
        <KpiCard
          label="Avg RPM"
          value={formatRpm(avgRpm)}
          status={rpmStatus}
          subtext={
            avgRpm === null
              ? undefined
              : `${avgRpm >= BREAK_EVEN_RPM ? "above" : "below"} $${BREAK_EVEN_RPM.toFixed(2)} break-even`
          }
        />
        <KpiCard
          label="Deadhead · MTD"
          value={formatPercent(deadhead.thisMonth)}
          status={deadheadStatus}
          subtext={`Last month: ${formatPercent(deadhead.lastMonth)}`}
        />
      </div>

      {/* Charts (#138, #139) and Outstanding list (#140) go below, later */}
      <div className="mt-6">
        <RevenueChart data={monthlyRevenue} />
      </div>
      <div className="mt-6">
        <RpmChart data={monthlyRpm} breakEven={BREAK_EVEN_RPM} />
      </div>
      <div className="mt-6">
        <OutstandingLoadsList loads={outstanding} />
      </div>
    </div>
  );
};

export default DashboardPage;
