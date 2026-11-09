import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useMaintenanceAlerts } from "@/hooks/useMaintenanceAlerts";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { useIntegrity } from "@/hooks/useIntegrity";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { DispatchLoadsTable } from "@/components/dashboard/DispatchLoadsTable";
import { DispatchAgentsTable } from "@/components/dashboard/DispatchAgentsTable";
import { DispatcherChip } from "@/components/dashboard/DispatcherChip";
import { DispatcherKpis, Figure } from "@/components/dispatch/DispatcherKpis";
import { weeksWords } from "@/components/dashboard/weeksWords";
import { Board, BoardCell } from "@/components/ui/Board";
import { Panel } from "@/components/ui/Panel";
import { PaceMeter, paceMarker } from "@/components/ui/PaceMeter";
import {
  getLoadsMonthly,
  getDeadheadTrend,
  getDetentionOwed,
} from "@/lib/metrics/dashboard";
import { getDispatcherCard } from "@/lib/metrics/dispatcherCard";
import { quarterWeekVerdicts } from "@/lib/metrics/grind";
import {
  getWeekGrossPipeline,
  getWeekGrossEarned,
  getBookedAheadGross,
  loadsInWeek,
} from "@/lib/metrics/rateTargets";
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
// Plain since the Redesign's phase B1 (the Cockpit, calls 10 and 11): the rank
// chip, the heat meter, the award pops and the quarter race board are gone; her
// booking figures are plain cards, and the one honest signal the meter carried
// — the quarter's weeks over break-even — is a plain stat.
const DispatchDashboard = () => {
  const { loads, isLoading: loadsLoading, error: loadsError } = useLoads(0);
  // The viewer's open Integrity count — the data rows she can fix (call 2); the
  // chip hides at zero and while loading (call 1).
  const integrity = useIntegrity();
  const integrityOpen = integrity.loading ? 0 : integrity.visible.length;
  const { trips, isLoading: tripsLoading, error: tripsError } = useTrips(0);
  const targets = useRateTargets(loads);
  const alerts = [...useMaintenanceAlerts(loads), ...useComplianceAlerts()];
  const now = useMemo(() => new Date(), []);

  // Two scopes on one board (Jason, 2026-09-11: "her goals must align with the
  // business — my goals"):
  //   • the BUSINESS — what's booked, rolling, earned, committed this week, and
  //     the quarter's weeks over break-even — is account-wide, so her numbers
  //     match the owner's board to the dollar;
  //   • her booking figures stay hers, from booked_by === her id.
  // Issue #465 was this split done wrong: the pace meter counted only her own
  // bookings, so a week where Jason booked one of the loads never summed.
  const selfId = localStorage.getItem("user_id") ?? "";
  const mine = useMemo(
    () => (selfId ? loads.filter((l) => l.booked_by === selfId) : []),
    [loads, selfId],
  );

  // Free-time setting drives what counts as detention (same source as Loads).
  const [freeHours, setFreeHours] = useState(DEFAULT_DETENTION_FREE_HOURS);
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // Her figures run on the same engine as her page — real bookings only
  // (a cancelled load or a TONU never counts), gross per driven mile.
  const card = useMemo(
    () =>
      selfId
        ? getDispatcherCard(loads, selfId, targets.bookingLadder, freeHours, now)
        : null,
    [loads, selfId, targets.bookingLadder, freeHours, now],
  );

  // The quarter's completed pay weeks against the meter's own floor and target.
  const quarter = useMemo(
    () => weeksWords(quarterWeekVerdicts(loads, targets.gross, now)),
    [loads, targets.gross, now],
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

  // The board she dispatches is the whole board — every load, whoever booked it.
  const bookedCount = loads.filter((l) => l.load_status === "booked").length;
  const inTransitCount = loads.filter(
    (l) => l.load_status === "in_transit",
  ).length;
  const loadsMonthly = getLoadsMonthly(loads);
  const loadsDeltaPct =
    loadsMonthly.lastMonth > 0
      ? Math.round(
          ((loadsMonthly.thisMonth - loadsMonthly.lastMonth) /
            loadsMonthly.lastMonth) *
            100,
        )
      : null;
  const detention = getDetentionOwed(loads, freeHours);
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

  // Her chase surface — the shop's booking floor + weekly target (account cost)
  // and the week the BUSINESS is filling: every load landing this pay week,
  // hers or Jason's. Same inputs as the owner's pace meter, so the two boards
  // never disagree on how the week is going (#465).
  const earned =
    targets.weekStart && targets.weekEnd
      ? getWeekGrossEarned(loads, targets.weekStart, targets.weekEnd)
      : 0;
  // The still-open slice of the week — NOT getWeekGrossCommitted, which
  // includes delivered loads and double-counts them when summed with earned.
  const committed =
    targets.weekStart && targets.weekEnd
      ? getWeekGrossPipeline(loads, targets.weekStart, targets.weekEnd)
      : 0;
  // The pipeline on the board — bookings landing beyond this pay week. The
  // meter can't show them yet (committed counts the landing week), but the
  // work happened NOW, so the card says so (Jason, 2026-08-15: her booked
  // $5,220 was invisible until its week arrived).
  const bookedAhead = targets.weekEnd ? getBookedAheadGross(loads, targets.weekEnd) : 0;
  // Her loads landing this pay week — the same date rule as the meter.
  const loadsThisWeek =
    targets.weekStart && targets.weekEnd
      ? loadsInWeek(mine, targets.weekStart, targets.weekEnd).length
      : 0;
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
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* full-bleed statusbar: her identity and her one big button */}
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
          {integrityOpen > 0 && (
            <Link
              to="/integrity"
              className="inline-flex items-center gap-[7px] h-[26px] px-[11px] rounded-full border border-hairline font-condensed font-semibold text-[12.5px] tracking-[.08em] whitespace-nowrap text-amber-hi hover:text-hot"
            >
              INTEGRITY · {integrityOpen} OPEN ›
            </Link>
          )}
          <Link
            to="/score"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14.5px] tracking-[.05em] bg-amber text-on-amber whitespace-nowrap hover:brightness-105"
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

          {/* her chase surface: the floor she books against + the week she's
              filling · beside it, her own figures and the quarter's weeks */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3 items-start">
            <Panel className="p-5">
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
                    style={{ left: `${pos(cur)}%` }}
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
                    {money(earned)}
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
                  <div className="ml-auto rounded-[10px] border border-hairline px-3.5 py-2">
                    <p className="font-condensed font-semibold text-[22px] leading-none tabular-nums">
                      {money(dailyTarget)}
                    </p>
                    <p className="ds2-label mt-1" style={{ fontSize: 9 }}>
                      daily target
                    </p>
                  </div>
                )}
              </div>
            </Panel>

            <div className="flex flex-col gap-3">
              {card && <DispatcherKpis card={card} loadsThisWeek={loadsThisWeek} />}
              <Panel className="p-4" data-testid="weeks-card">
                <Figure label={quarter.label} value={quarter.figure} sub={quarter.detail} />
              </Panel>
            </div>
          </div>

          {/* The workhorses — searchable, paginated loads + agents */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <DispatchLoadsTable loads={loads} freeHours={freeHours} />
            <DispatchAgentsTable loads={loads} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispatchDashboard;
