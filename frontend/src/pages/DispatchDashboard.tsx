import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { useDispatcherAwardPops } from "@/hooks/useDispatcherAwardPops";
import { usePersonalGrind } from "@/hooks/useGrind";
import { AwardPopHost } from "@/components/celebrations/AwardPopHost";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { GrindMeterView } from "@/components/dashboard/GrindMeter";
import { RaceBoard } from "@/components/dashboard/agents/RaceBoard";
import { DispatchLoadsTable } from "@/components/dashboard/DispatchLoadsTable";
import { DispatchAgentsTable } from "@/components/dashboard/DispatchAgentsTable";
import { DispatcherChip } from "@/components/dashboard/DispatcherChip";
import { Board, BoardCell } from "@/components/ui/Board";
import { ForgedPlate } from "@/components/ui/ForgedPlate";
import { PaceMeter, paceMarker } from "@/components/ui/PaceMeter";
import { CountUp } from "@/components/ui/CountUp";
import {
  getLoadsMonthly,
  getDeadheadTrend,
  getDetentionOwed,
} from "@/lib/metrics/dashboard";
import { getDispatcherCard } from "@/lib/metrics/dispatcherCard";
import { getWeekGrossPipeline, getWeekGrossEarned, getBookedAheadGross } from "@/lib/metrics/rateTargets";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { DEADHEAD_TARGET } from "@/lib/constants/targets";
import { money, rpm as fmtRpm } from "@/lib/format";

const formatPercent = (ratio: number | null): string =>
  ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;

// Detention headline as decimal hours ("12.5h") — the dollar isn't known until
// the settlement lands, so we only ever show time.
const hoursLabel = (minutes: number): string =>
  minutes === 0 ? "0h" : `${(minutes / 60).toFixed(1)}h`;

// ISO-8601 week number, UTC-anchored like every other date in the app.
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
};
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Brandie's board — operational only. No net revenue, RPM, or P&L; gross pace
// (which she books) is her chase surface. Detention is hours, not dollars.
const DispatchDashboard = () => {
  const { loads, isLoading: loadsLoading, error: loadsError } = useLoads(0);
  const { trips, isLoading: tripsLoading, error: tripsError } = useTrips(0);
  const targets = useRateTargets(loads);
  const alerts = [...useMaintenanceAlerts(loads), ...useComplianceAlerts()];
  const now = useMemo(() => new Date(), []);

  // Her board counts only the loads SHE booked (the shared agent race below stays
  // account-wide). Attribution is booked_by === her own id.
  const selfId = localStorage.getItem("user_id") ?? "";
  const mine = useMemo(
    () => (selfId ? loads.filter((l) => l.booked_by === selfId) : []),
    [loads, selfId],
  );
  // Her personal-pace streak: graded against her OWN typical week (median of her
  // recent weekly booked gross), so it's winnable and genuinely hers — not the
  // shop's cost target. Feeds the HEAT meter + the Iron Booker patch.
  const grind = usePersonalGrind(mine);

  // Free-time setting drives what counts as detention (same source as Loads).
  const [freeHours, setFreeHours] = useState(3);
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // Her achievements pop the same way the driver's do — computed from her own
  // bookings, celebrated on her board. Gated on the rate ladder being ready so
  // the day-one baseline is built from complete data.
  const awardInput =
    selfId && targets.bookingLadder.walkAway != null
      ? {
          loads,
          userId: selfId,
          ladder: targets.bookingLadder,
          scoreBasis: {
            costPerDrivenMile: targets.basis.costPerTotalMile,
            payTake: targets.basis.payTake,
          },
          freeHours,
          streak: grind?.bestStreak ?? 0,
          // Grade "steal"/"grand slam" on the same tiers her forge page uses, so
          // the two surfaces never disagree on a medal.
          tiers: targets.tiers,
          specTiers: targets.specTiers,
        }
      : null;
  const pops = useDispatcherAwardPops(awardInput);

  // Her rank chip runs on the same engine as her card page — lifetime real
  // bookings, cancelled loads excluded.
  const rank = useMemo(
    () =>
      selfId
        ? getDispatcherCard(loads, selfId, targets.bookingLadder, freeHours, now)
            .rank
        : null,
    [loads, selfId, targets.bookingLadder, freeHours, now],
  );

  const isLoading = loadsLoading || tripsLoading;
  const error = loadsError || tripsError;

  if (isLoading)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
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
      <div className="p-6 text-ink min-h-screen">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const bookedCount = mine.filter((l) => l.load_status === "booked").length;
  const inTransitCount = mine.filter(
    (l) => l.load_status === "in_transit",
  ).length;
  const loadsMonthly = getLoadsMonthly(mine);
  const loadsDeltaPct =
    loadsMonthly.lastMonth > 0
      ? Math.round(
          ((loadsMonthly.thisMonth - loadsMonthly.lastMonth) /
            loadsMonthly.lastMonth) *
            100,
        )
      : null;
  const detention = getDetentionOwed(mine, freeHours);
  // Deadhead is truck physics — trips carry no booker, so pairing HER loads with
  // fleet trips would mis-charge fleet empty miles against her loaded miles. Keep
  // it account-wide (the rig's real deadhead), which is what the tile means.
  const deadhead = getDeadheadTrend(loads, trips, now);
  // Leaner than the 90-day baseline (or the target when there's no baseline yet)
  // reads green; drifting above it reads red so she catches it early.
  const deadheadBaseline = deadhead.rolling90 ?? DEADHEAD_TARGET;
  const deadheadTone =
    deadhead.thisMonth === null
      ? "none"
      : deadhead.thisMonth <= deadheadBaseline
        ? "pos"
        : "neg";

  // Her chase surface — the shop's booking floor + weekly target (account cost),
  // but the week she's actually filling is HER bookings (earned + committed).
  const earned =
    targets.weekStart && targets.weekEnd
      ? getWeekGrossEarned(mine, targets.weekStart, targets.weekEnd)
      : 0;
  // The still-open slice of the week — NOT getWeekGrossCommitted, which
  // includes delivered loads and double-counts them when summed with earned.
  const committed =
    targets.weekStart && targets.weekEnd
      ? getWeekGrossPipeline(mine, targets.weekStart, targets.weekEnd)
      : 0;
  // The pipeline she just built — bookings landing beyond this pay week. The
  // meter can't show them yet (committed counts the landing week), but the
  // work happened NOW, so the card says so (Jason, 2026-08-15: her booked
  // $5,220 was invisible until its week arrived).
  const bookedAhead = targets.weekEnd ? getBookedAheadGross(mine, targets.weekEnd) : 0;
  const weeklyTarget: number | null = targets.gross?.weeklyTarget ?? null;
  const weeklyFloor: number | null = targets.gross?.weeklyBreakEven ?? null;
  const dailyTarget: number | null = targets.gross?.dailyTarget ?? null;
  const ladder = targets.bookingLadder ?? {};
  const cur: number | null = targets.grossRate ?? null;
  const gaugeHi = Math.max(ladder.strong ?? 0, cur ?? 0, ladder.target ?? 0) || 1;
  const gaugeLo = Math.min(ladder.walkAway ?? gaugeHi, cur ?? gaugeHi);
  const span = Math.max(gaugeHi - gaugeLo, gaugeHi * 0.1);
  const lo = gaugeLo - span * 0.16;
  const hi = gaugeHi + span * 0.1;
  const pos = (v: number | null | undefined) =>
    v == null ? 0 : Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));

  const dateLine = [
    now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
    `Week ${isoWeek(now)}`,
    ...(targets.weekStart
      ? [
          (() => {
            const ws = new Date(targets.weekStart);
            return `pay week ${DAY[ws.getUTCDay()]}–${DAY[(ws.getUTCDay() + 6) % 7]}`;
          })(),
        ]
      : []),
  ].join(" · ");

  return (
    <div className="min-h-screen text-ink font-body">
      <AwardPopHost pops={pops} />
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* full-bleed statusbar: her identity, her rank, her one big button */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">
            DISPATCH BOARD
          </h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            {dateLine}
          </span>
          <span className="flex-1" />
          <DispatcherChip />
          {rank && (
            <span className="inline-flex items-center gap-2 h-[30px] px-3 rounded-full font-condensed font-semibold text-[13px] bg-gradient-to-b from-plate-a to-plate-lo border-t border-white/10 shadow">
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber"
                style={{ boxShadow: "0 0 7px rgba(232,148,10,.9)" }}
              />
              {rank.name}
              <span className="text-faint font-medium text-[10.5px]">
                · {rank.count} booked
                {rank.next ? ` · next tier at ${rank.next.min}` : ""}
              </span>
            </span>
          )}
          <Link
            to="/score"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14.5px] tracking-[.05em] text-canvas whitespace-nowrap hover:brightness-105"
            style={{
              background:
                "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow:
                "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
            }}
          >
            <Zap size={15} /> SCORE A LOAD
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <AlertBanners alerts={alerts} />

          {/* operational vitals — five doors, no money-kept numbers */}
          <Board className="grid grid-cols-2 md:grid-cols-5">
            <BoardCell
              className="border-b md:border-b-0 md:border-r ds2-cell-rule"
              label="Booked"
              value={String(bookedCount)}
              sub="on the board"
              to="/loads"
              go="loads"
            />
            <BoardCell
              className="border-b md:border-b-0 md:border-r ds2-cell-rule"
              label="In transit"
              value={String(inTransitCount)}
              sub="rolling now"
              tone={inTransitCount > 0 ? "amb" : "none"}
              to="/loads"
              go="loads"
            />
            <BoardCell
              className="border-b md:border-b-0 md:border-r ds2-cell-rule"
              label="Loads · MTD"
              value={String(loadsMonthly.thisMonth)}
              sub={
                loadsDeltaPct != null ? (
                  <>
                    <b
                      className={
                        loadsDeltaPct >= 0
                          ? "text-status-positive-text"
                          : "text-status-negative-text"
                      }
                    >
                      {loadsDeltaPct >= 0 ? "▲" : "▼"} {Math.abs(loadsDeltaPct)}%
                    </b>{" "}
                    vs last month
                  </>
                ) : (
                  `last month ${loadsMonthly.lastMonth}`
                )
              }
              tone={loadsDeltaPct != null && loadsDeltaPct >= 0 ? "pos" : "none"}
              to="/loads"
              go="loads"
            />
            <BoardCell
              className="md:border-r ds2-cell-rule"
              label="Detention owed"
              value={hoursLabel(detention.totalMinutes)}
              sub={
                detention.loadCount === 0
                  ? "nothing to chase"
                  : `${detention.loadCount} load${
                      detention.loadCount === 1 ? "" : "s"
                    } · settles on the statement`
              }
              tone={detention.totalMinutes > 0 ? "amb" : "none"}
              to="/loads"
              go="loads"
            />
            <BoardCell
              label="Deadhead · MTD"
              value={formatPercent(deadhead.thisMonth)}
              sub={`90-day avg ${formatPercent(deadhead.rolling90)}`}
              tone={deadheadTone as "pos" | "neg" | "none"}
              to="/trips"
              go="trips"
            />
          </Board>

          {/* her chase surface: the floor she books against + the week she's filling */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3 items-start">
            <ForgedPlate chamfer tilt className="p-5">
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <span className="ds2-label">
                  Booking floor &amp; your week pace · gross
                </span>
                {cur != null && (
                  <span className="font-condensed font-semibold text-[15px] text-amber-hi tabular-nums">
                    booking {fmtRpm(cur)}/mi
                  </span>
                )}
              </div>
              <div className="relative h-[60px] mt-3.5">
                <div className="absolute left-0 right-0 top-[28px] h-[2px] bg-hairline" />
                {ladder.walkAway != null && (
                  <div
                    className="absolute left-0 top-[28px] h-[2px] bg-status-negative-text opacity-55"
                    style={{ width: `${pos(ladder.walkAway)}%` }}
                  />
                )}
                {(
                  [
                    ["walkAway", "Walk-away"],
                    ["target", "Target"],
                    ["strong", "Strong"],
                  ] as const
                ).map(([k, nm]) =>
                  ladder[k] != null ? (
                    <div key={k}>
                      <div
                        className="absolute top-[22px] w-px h-[13px] bg-dim"
                        style={{ left: `${pos(ladder[k])}%` }}
                      />
                      <span
                        className="absolute top-0 -translate-x-1/2 text-[9px] font-semibold tracking-[.1em] uppercase text-faint whitespace-nowrap"
                        style={{ left: `${pos(ladder[k])}%` }}
                      >
                        {nm}
                      </span>
                      <span
                        className="absolute top-[42px] -translate-x-1/2 font-condensed font-semibold text-[12px] text-dim tabular-nums"
                        style={{ left: `${pos(ladder[k])}%` }}
                      >
                        {fmtRpm(ladder[k])}
                      </span>
                    </div>
                  ) : null,
                )}
                {cur != null && (
                  <div
                    className="absolute top-[13px] w-[2px] h-[30px] -translate-x-1/2 bg-amber-hi"
                    style={{
                      left: `${pos(cur)}%`,
                      boxShadow: "0 0 9px rgba(245,176,58,.8)",
                    }}
                  />
                )}
              </div>
              {weeklyTarget ? (
                <PaceMeter
                  filled={earned}
                  ghost={committed}
                  target={weeklyTarget}
                  markers={[
                    ...(weeklyFloor ? [paceMarker("floor", weeklyFloor)] : []),
                    paceMarker("target", weeklyTarget),
                  ]}
                />
              ) : null}
              <div className="flex gap-5 mt-3 flex-wrap items-end">
                <div>
                  <p className="font-condensed font-semibold text-[19px] text-amber-hi tabular-nums leading-none">
                    <CountUp value={earned} format={money} />
                  </p>
                  <p className="ds2-label mt-1" style={{ fontSize: 9 }}>
                    earned
                  </p>
                </div>
                <div>
                  <p className="font-condensed font-semibold text-[19px] text-dim tabular-nums leading-none">
                    {money(committed)}
                  </p>
                  <p className="ds2-label mt-1" style={{ fontSize: 9 }}>
                    committed
                  </p>
                </div>
                <div>
                  <p className="font-condensed font-semibold text-[19px] tabular-nums leading-none">
                    {money(earned + committed)}
                  </p>
                  <p className="ds2-label mt-1" style={{ fontSize: 9 }}>
                    projected
                  </p>
                </div>
                {bookedAhead > 0 && (
                  <div>
                    <p className="font-condensed font-semibold text-[19px] tabular-nums leading-none text-amber-hi">
                      {money(bookedAhead)}
                    </p>
                    <p className="ds2-label mt-1" style={{ fontSize: 9 }}>
                      booked ahead · lands beyond this week
                    </p>
                  </div>
                )}
                {dailyTarget != null && (
                  <div className="ml-auto ds2-well px-3.5 py-2">
                    <p className="font-display text-[22px] leading-none tabular-nums">
                      {money(dailyTarget)}
                    </p>
                    <p className="ds2-label mt-1" style={{ fontSize: 9 }}>
                      daily target
                    </p>
                  </div>
                )}
              </div>
            </ForgedPlate>
            <GrindMeterView grind={grind} mode="personal" />
          </div>

          {/* The workhorses — searchable, paginated loads + agents */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <DispatchLoadsTable loads={loads} freeHours={freeHours} />
            <DispatchAgentsTable loads={loads} />
          </div>

          {/* THE RACE — the same quarter leaderboard the owner sees, same
              component, same logic. */}
          <RaceBoard loads={loads} />
        </div>
      </div>
    </div>
  );
};

export default DispatchDashboard;
