import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { KpiCard } from "@/components/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { RateTargetsCard } from "@/components/dashboard/RateTargetsCard";
import { GrindMeter } from "@/components/dashboard/GrindMeter";
import { TopAgents } from "@/components/dashboard/TopAgents";
import { DispatchLoadsTable } from "@/components/dashboard/DispatchLoadsTable";
import { DispatchAgentsTable } from "@/components/dashboard/DispatchAgentsTable";
import { DispatcherChip } from "@/components/dashboard/DispatcherChip";
import {
  getLoadsMonthly,
  getTopAgentsByRevenue,
  getDeadheadTrend,
  getDetentionOwed,
} from "@/lib/metrics/dashboard";
import {
  computeHonors,
  currentQuarterStandings,
} from "@/lib/metrics/agentLeaderboard";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { DEADHEAD_TARGET } from "@/lib/constants/targets";

const formatPercent = (ratio: number | null): string =>
  ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;

// Detention headline as decimal hours ("12.5h") — the dollar isn't known until
// the settlement lands, so we only ever show time.
const hoursLabel = (minutes: number): string =>
  minutes === 0 ? "0h" : `${(minutes / 60).toFixed(1)}h`;

const computeDelta = (current: number | null, previous: number | null) => {
  if (current === null || previous === null || previous === 0) return null;
  const percent = ((current - previous) / previous) * 100;
  return {
    percent,
    direction: percent >= 0 ? ("up" as const) : ("down" as const),
  };
};

// Brandie's board — operational only. No net revenue, RPM, or P&L; gross pace
// (which she books) stays via the rate card. Detention is hours, not dollars.
const DispatchDashboard = () => {
  const { loads, isLoading: loadsLoading, error: loadsError } = useLoads(0);
  const { trips, isLoading: tripsLoading, error: tripsError } = useTrips(0);
  const targets = useRateTargets(loads);
  const alerts = [...useMaintenanceAlerts(loads), ...useComplianceAlerts()];

  // Free-time setting drives what counts as detention (same source as Loads).
  const [freeHours, setFreeHours] = useState(3);
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  const isLoading = loadsLoading || tripsLoading;
  const error = loadsError || tripsError;

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" style={{ borderRadius: 13 }} />
          ))}
        </div>
        <Skeleton className="h-28 mt-6" style={{ borderRadius: 13 }} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <Skeleton className="h-56" style={{ borderRadius: 13 }} />
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

  const now = new Date();
  const bookedCount = loads.filter((l) => l.load_status === "booked").length;
  const inTransitCount = loads.filter(
    (l) => l.load_status === "in_transit",
  ).length;
  const loadsMonthly = getLoadsMonthly(loads);
  const loadsDelta = computeDelta(loadsMonthly.thisMonth, loadsMonthly.lastMonth);
  const detention = getDetentionOwed(loads, freeHours);
  const deadhead = getDeadheadTrend(loads, trips, now);
  // Leaner than the 90-day baseline (or the target when there's no baseline yet)
  // reads green; drifting above it reads red so she catches it early.
  const deadheadBaseline = deadhead.rolling90 ?? DEADHEAD_TARGET;
  const deadheadStatus =
    deadhead.thisMonth === null
      ? "neutral"
      : deadhead.thisMonth <= deadheadBaseline
        ? "good"
        : "bad";
  const topAgents = getTopAgentsByRevenue(loads);
  const agentHonors = computeHonors(loads, now);
  const agentStandings = currentQuarterStandings(loads, now);

  return (
    <div className="p-6 bg-iron text-light min-h-screen font-body">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="font-comic text-3xl" style={{ color: "#f5b03a" }}>
            DISPATCH BOARD
          </h1>
          <div className="mt-2">
            <DispatcherChip />
          </div>
        </div>
        <Link
          to="/score"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap hover:opacity-90"
          style={{ background: "#e8940a", color: "#10151f" }}
        >
          <Zap size={15} /> Score a Load
        </Link>
      </div>

      <AlertBanners alerts={alerts} />

      {/* KPI STRIP — operational only */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Booked" value={String(bookedCount)} subtext="on the board" />
        <KpiCard label="In transit" value={String(inTransitCount)} />
        <KpiCard
          label="Loads · MTD"
          value={String(loadsMonthly.thisMonth)}
          delta={loadsDelta}
        />
        <KpiCard
          label="Detention owed"
          value={hoursLabel(detention.totalMinutes)}
          subtext={
            detention.loadCount === 0
              ? "nothing to chase"
              : `${detention.loadCount} load${
                  detention.loadCount === 1 ? "" : "s"
                } · settles on the statement`
          }
        />
        <KpiCard
          label="Deadhead · MTD"
          value={formatPercent(deadhead.thisMonth)}
          status={deadheadStatus}
          subtext={`90-day avg ${formatPercent(deadhead.rolling90)}`}
        />
      </div>

      {/* Booking floor + gross pace | the grind (gross is hers; net/RPM owner-only) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6 items-start">
        <RateTargetsCard targets={targets} />
        <GrindMeter loads={loads} />
      </div>

      {/* The workhorses — searchable, paginated loads + agents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6 items-start">
        <DispatchLoadsTable loads={loads} freeHours={freeHours} />
        <DispatchAgentsTable loads={loads} />
      </div>

      {/* Top agents — ranked by gross, same card as the owner dashboard */}
      <div className="mt-6">
        <TopAgents
          agents={topAgents}
          honors={agentHonors}
          standings={agentStandings}
        />
      </div>
    </div>
  );
};

export default DispatchDashboard;
