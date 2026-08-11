import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { getWeekGrossEarned } from "@/lib/metrics/rateTargets";
import {
  getRevenueMTD,
  getMonthlyDeadhead,
  getLoadsMonthly,
  getUpcomingLoads,
} from "@/lib/metrics/dashboard";
import { loadRevenue } from "@/lib/metrics/loads";
import { loadRevenue as loadNet } from "@/lib/metrics/rateTargets";
import { getQuarterPace } from "@/lib/metrics/quarterPace";
import { agentStops, scoreStops } from "@/lib/metrics/stopScore";
import { projectWeek } from "@/lib/metrics/weekProjection";
import { nextSettlementDate } from "@/lib/metrics/settlement";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import type { Alert } from "@/types/alert";
import { GrindMeter } from "@/components/dashboard/GrindMeter";
import { Board, BoardCell } from "@/components/ui/Board";
import { ForgedPlate } from "@/components/ui/ForgedPlate";
import { CountUp } from "@/components/ui/CountUp";
import { PaceMeter, paceMarker } from "@/components/ui/PaceMeter";
import { DUR, GSAP_EASE, STAGGER } from "@/theme/motion";
import { money, rpm as fmtRpm } from "@/lib/format";

gsap.registerPlugin(useGSAP);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Targets = any; // the useRateTargets shape (weekEarned/weekBooked/gross/bookingLadder/grossRate)

const PACE = {
  beat: { text: "on track to beat", color: "#4ade80", glyph: "▲" },
  behind: { text: "on track to finish under", color: "#f87171", glyph: "▼" },
  even: { text: "on pace with", color: "#f5a623", glyph: "—" },
  early: { text: "too early to call vs", color: "#9fb0c9", glyph: "·" },
  "no-prior": { text: "first quarter — no", color: "#9fb0c9", glyph: "·" },
} as const;

// Weekday + date in UTC — date-only strings must never shift a day locally.
const fmtDay = (d: Date): string =>
  d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const fmtDayIso = (iso: string): string => fmtDay(new Date(iso));

// "Jun 18–24" / "Jun 29 – Jul 5" for a pay week starting at `s`.
const weekRangeLabel = (s: Date): string => {
  const e = new Date(s);
  e.setUTCDate(s.getUTCDate() + 6);
  const m = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return m(s) === m(e)
    ? `${m(s)} ${s.getUTCDate()}–${e.getUTCDate()}`
    : `${m(s)} ${s.getUTCDate()} – ${m(e)} ${e.getUTCDate()}`;
};

// The record tag on the pace plate — plain words only. Shows when this week's
// projection is at or near the best completed week in the window.
const RecordTag = ({
  projected,
  best,
}: {
  projected: number;
  best: number;
}) => {
  if (best <= 0 || projected < best * 0.9) return null;
  const beats = projected >= best;
  return (
    <span
      className="inline-flex items-center gap-2 ml-3.5 px-2.5 py-1 rounded-[7px] align-[6px] bg-well"
      style={{
        boxShadow:
          "inset 0 2px 4px rgba(0,0,0,.55), 0 0 12px rgba(245,176,58,.18)",
      }}
    >
      <span className="font-forge font-semibold text-[11px] tracking-[.14em] text-amber-light">
        {beats ? "NEW BEST WEEK IN REACH" : "BEST WEEK IN REACH"}
      </span>
      <span className="font-condensed font-semibold text-[12px] text-dim tabular-nums">
        {beats
          ? `projected ${money(projected)} beats your ${money(best)} record`
          : `${money(best - projected)} more passes your ${money(best)} record`}
      </span>
    </span>
  );
};

export const PulseTab = ({
  loads,
  trips,
  targets,
  alerts,
  settlementDay,
}: {
  loads: Load[];
  trips: Trip[];
  targets: Targets;
  alerts: Alert[];
  settlementDay: number | null;
}) => {
  const now = useMemo(() => new Date(), []);

  const earned = targets.weekEarned ?? 0;
  const committed = targets.weekBooked ?? 0;
  const weeklyTarget: number | null = targets.gross?.weeklyTarget ?? null;
  const weeklyFloor: number | null = targets.gross?.weeklyBreakEven ?? null;
  const progress =
    weeklyTarget && weeklyTarget > 0 ? Math.min(1, earned / weeklyTarget) : null;
  // Smart projection — each load counted once, by its delivery date inside
  // the pay week. weekBooked can still hold an already-delivered load, which
  // double-counted the old earned+committed projection (the fake record).
  const week = useMemo(
    () =>
      targets.weekStart ? projectWeek(loads, new Date(targets.weekStart)) : null,
    [loads, targets.weekStart],
  );
  const incoming = week ? week.incoming : committed;
  const projected = earned + incoming;

  const mtd = getRevenueMTD(loads);
  const deadhead = getMonthlyDeadhead(loads, trips).thisMonth;
  const loadsM = getLoadsMonthly(loads);
  const upcoming = getUpcomingLoads(loads);
  const pace = useMemo(() => getQuarterPace(loads, now), [loads, now]);

  // Landing on the next weekly settlement: delivered, POD in, not yet paid.
  // Timing, not receivables — the carrier clears it every settlement day. This is
  // the money that ACTUALLY lands, so it's NET (Landstar's deposit after its cut),
  // not the gross customer rate.
  const pipelineLoads = useMemo(
    () =>
      loads.filter(
        (l) => l.load_status === "delivered" && l.payment_status !== "paid",
      ),
    [loads],
  );
  const pipeline = useMemo(
    () => pipelineLoads.reduce((s, l) => s + loadNet(l), 0),
    [pipelineLoads],
  );
  const settleDate =
    settlementDay != null ? nextSettlementDate(now, settlementDay) : null;

  // Your delivery punctuality — did YOU hit the appointment at the dock — over the
  // last 90 days of delivered loads. freeHours doesn't affect on-time (it grades
  // detention, not the appointment), so a default is fine here. null until 3 graded.
  const onTime = useMemo(() => {
    const cutoff = now.getTime() - 90 * 86_400_000;
    const recent = loads.filter(
      (l) =>
        l.load_status === "delivered" &&
        l.delivery_date &&
        new Date(l.delivery_date).getTime() >= cutoff,
    );
    return scoreStops(agentStops(recent, 3));
  }, [loads, now]);

  // Last 8 pay-weeks of gross earned, anchored to the configured week start.
  const weeks = useMemo(() => {
    const anchor: Date = targets.weekStart ? new Date(targets.weekStart) : now;
    const out: { earned: number; now: boolean; start: Date }[] = [];
    for (let i = 7; i >= 0; i--) {
      const s = new Date(anchor);
      s.setUTCDate(anchor.getUTCDate() - i * 7);
      const e = new Date(s);
      e.setUTCDate(s.getUTCDate() + 7);
      out.push({ earned: getWeekGrossEarned(loads, s, e), now: i === 0, start: s });
    }
    return out;
  }, [loads, targets.weekStart, now]);
  const weekMax = Math.max(weeklyTarget ?? 0, ...weeks.map((w) => w.earned), 1);

  // The best COMPLETED week in the window — the one to beat.
  const bestWeek = useMemo(() => {
    const done = weeks.filter((w) => !w.now);
    if (done.length === 0) return null;
    const top = done.reduce((b, w) => (w.earned > b.earned ? w : b), done[0]);
    return top.earned > 0 ? top : null;
  }, [weeks]);

  const ladder = targets.bookingLadder ?? {};
  const cur: number | null = targets.grossRate ?? null;
  // Floor-anchored scale, per the approved mockup: the track starts a step
  // below walk-away and ends a step past the top, so the ladder spreads the
  // full width instead of cramming into the right third (real ladders sit in
  // a narrow band — a 0-based domain wastes half the track and collides the
  // labels). Padding keeps centered labels from clipping at either edge.
  const gaugeHi = Math.max(ladder.strong ?? 0, cur ?? 0, ladder.target ?? 0) || 1;
  const gaugeLo = Math.min(ladder.walkAway ?? gaugeHi, cur ?? gaugeHi);
  const span = Math.max(gaugeHi - gaugeLo, gaugeHi * 0.1);
  const lo = gaugeLo - span * 0.16;
  const hi = gaugeHi + span * 0.1;
  const pos = (v: number | null | undefined) =>
    v == null ? 0 : Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const overFloor = cur != null && ladder.walkAway != null ? cur - ladder.walkAway : null;

  const paceMeta = PACE[pace.verdict];

  // The Next rail — every clock that matters, one list. Rows self-omit when
  // there's nothing on that clock; each row is a door.
  const nextRows = useMemo(() => {
    const rows: {
      kind: string;
      cls: string;
      title: string;
      detail: string;
      amount?: number;
      to: string;
    }[] = [];
    const inTransit = loads
      .filter((l) => l.load_status === "in_transit" && l.delivery_date)
      .sort((a, b) =>
        (a.delivery_date as string) < (b.delivery_date as string) ? -1 : 1,
      )[0];
    if (inTransit)
      rows.push({
        kind: "Delivery",
        cls: "text-amber-light",
        title: `${inTransit.origin_city}, ${inTransit.origin_state} → ${inTransit.destination_city}, ${inTransit.destination_state}`,
        detail: fmtDayIso(inTransit.delivery_date as string),
        amount: loadRevenue(inTransit),
        to: `/loads/${inTransit.load_id}`,
      });
    const nextUp = upcoming[0];
    if (nextUp)
      rows.push({
        kind: "Pickup",
        cls: "text-[#7ab0e8]",
        title: nextUp.lane,
        detail: `${fmtDayIso(nextUp.pickup_date)} · ${nextUp.agent}`,
        amount: nextUp.gross,
        to: `/loads/${nextUp.load_id}`,
      });
    if (pipeline > 0)
      rows.push({
        kind: "Settlement",
        cls: "text-status-positive-text",
        title: `${money(pipeline)} landing`,
        detail: `${settleDate ? fmtDay(settleDate) + " · " : ""}${pipelineLoads.length} load${pipelineLoads.length === 1 ? "" : "s"} · POD in`,
        to: "/loads",
      });
    const maint = alerts.find((a) => a.kind === "maintenance");
    if (maint)
      rows.push({
        kind: "Maintenance",
        cls: "text-amber-light",
        title: maint.message,
        detail: "",
        to: maint.actionHref ?? "/maintenance",
      });
    const comp = alerts.find((a) => a.kind !== "maintenance");
    if (comp)
      rows.push({
        kind: "Compliance",
        cls: "text-dim",
        title: comp.message,
        detail: "",
        to: comp.actionHref ?? "/compliance",
      });
    return rows;
  }, [loads, upcoming, pipeline, pipelineLoads, settleDate, alerts]);

  // Boot sequence — the view's one orchestrated moment (gate-3 spec §06).
  const scope = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      gsap.from(".ds2-boot", {
        y: 10,
        autoAlpha: 0,
        duration: DUR.base,
        ease: GSAP_EASE.mech,
        stagger: STAGGER.tight,
        clearProps: "transform,opacity,visibility",
      });
      if (needleRef.current) {
        gsap.from(needleRef.current, {
          left: 0,
          duration: DUR.slow,
          ease: GSAP_EASE.mech,
          delay: 0.35,
        });
      }
    },
    { scope },
  );

  return (
    <div ref={scope} className="flex flex-col gap-3">
      {alerts.length > 0 && (
        <div className="ds2-boot">
          <AlertBanners alerts={alerts} />
        </div>
      )}

      {/* hero — the pay week: the view's one forged plate (forged = chase) */}
      <ForgedPlate
        chamfer
        tilt
        className="ds2-boot p-5 grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-5"
      >
        <div>
          <p className="ds2-label">This pay week</p>
          <p className="font-display text-[36px] tracking-[.02em] leading-none mt-1.5 tabular-nums">
            <CountUp value={earned} format={money} />{" "}
            <span className="text-[15px] text-dim font-condensed tracking-normal">
              earned
            </span>
            {bestWeek && (
              <RecordTag projected={projected} best={bestWeek.earned} />
            )}
          </p>
          {weeklyTarget ? (
            <PaceMeter
              filled={earned}
              ghost={incoming}
              target={weeklyTarget}
              markers={[
                ...(weeklyFloor ? [paceMarker("floor", weeklyFloor)] : []),
                paceMarker("target", weeklyTarget),
              ]}
            />
          ) : null}
          <p className="text-[11.5px] text-faint mt-1.5">
            {progress != null && weeklyTarget ? (
              <>
                <b className="text-ink">{Math.round(progress * 100)}%</b> of your{" "}
                <b className="text-ink">{money(weeklyTarget)}</b> target earned ·{" "}
              </>
            ) : null}
            <b className="text-dim">{money(incoming)}</b>
            {week ? " still to deliver this week" : " booked ahead"} — projected{" "}
            <b
              className={
                weeklyTarget && projected > weeklyTarget
                  ? "text-amber-light"
                  : "text-dim"
              }
            >
              {money(projected)}
            </b>
            {weeklyTarget && projected > weeklyTarget
              ? ", past target into overdrive"
              : ""}
          </p>
        </div>
        <div className="md:border-l md:border-white/10 md:pl-5 flex flex-col justify-center gap-3">
          <div>
            <p className="ds2-label">Earned month-to-date</p>
            <p className="font-condensed font-semibold text-[22px] leading-none tabular-nums mt-1">
              {money(mtd)}
            </p>
            <p className="text-[11px] text-faint mt-0.5">
              {loadsM.thisMonth} load{loadsM.thisMonth === 1 ? "" : "s"} delivered
            </p>
          </div>
          <div>
            <p className="ds2-label">Quarter pace</p>
            <p
              className="text-[12px] font-bold mt-1"
              style={{ color: paceMeta.color }}
            >
              {paceMeta.glyph} {pace.label} {paceMeta.text} {pace.prevLabel}
            </p>
          </div>
          <div>
            <p className="ds2-label">Next settlement</p>
            {pipeline > 0 ? (
              <>
                <p className="font-condensed font-semibold text-[22px] leading-none tabular-nums mt-1 text-status-positive-text">
                  {money(pipeline)}
                </p>
                <p className="text-[11px] text-faint mt-0.5">
                  {settleDate ? `lands ${fmtDay(settleDate)} · ` : ""}
                  {pipelineLoads.length} load
                  {pipelineLoads.length === 1 ? "" : "s"} · POD in
                </p>
              </>
            ) : (
              <p className="text-[12px] text-faint mt-1">
                nothing waiting — all settled up
              </p>
            )}
          </div>
        </div>
      </ForgedPlate>

      {/* vitals — five doors (flat = read) */}
      <Board className="ds2-boot grid grid-cols-2 md:grid-cols-5">
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Loads · MTD"
          value={String(loadsM.thisMonth)}
          sub={`last month ${loadsM.lastMonth}`}
          to="/loads"
          go="loads"
        />
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Deadhead"
          value={deadhead != null ? `${Math.round(deadhead * 100)}%` : "—"}
          sub="odometer-true · target ≤ 20%"
          tone={deadhead == null ? "none" : deadhead <= 0.2 ? "pos" : "amb"}
          to="/trips"
          go="trips"
        />
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Avg net $/mi"
          value={targets.rollingRpm != null ? fmtRpm(targets.rollingRpm) : "—"}
          sub={
            targets.basis?.breakEvenRpm != null
              ? `break-even ${fmtRpm(targets.basis.breakEvenRpm)}`
              : "3-mo blended"
          }
          to="/settings"
          go="cost basis"
        />
        <BoardCell
          className="md:border-r ds2-cell-rule"
          label="On-time"
          value={
            onTime.onTimePct != null
              ? `${Math.round(onTime.onTimePct * 100)}%`
              : "—"
          }
          sub={
            onTime.onTimePct != null
              ? `${onTime.gradedStops} timed stops · 90d`
              : "needs 3+ timed stops"
          }
          tone={
            onTime.onTimePct == null
              ? "none"
              : onTime.onTimePct >= 0.9
                ? "pos"
                : onTime.onTimePct >= 0.75
                  ? "none"
                  : "amb"
          }
          to="/loads"
          go="loads"
        />
        <BoardCell
          label="Best week"
          value={bestWeek ? money(bestWeek.earned) : "—"}
          valueClassName="text-amber-light"
          sub={
            bestWeek
              ? `${weekRangeLabel(bestWeek.start)} · the one to beat`
              : "first full weeks build it"
          }
          tone={bestWeek ? "amb" : "none"}
          to="/recap"
          go="recap"
        />
      </Board>

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3">
        {/* weekly earnings — history + the record line */}
        <Board className="ds2-boot p-4">
          <h3 className="ds2-label mb-2 flex justify-between">
            Weekly earnings{" "}
            <span className="normal-case tracking-normal font-normal text-faint">
              last 8 weeks · gross ·{" "}
              <span className="text-amber-light">— best week</span>{" "}
              <span className="text-status-positive-text">-- target</span>
            </span>
          </h3>
          <svg viewBox="0 0 620 150" className="w-full">
            {weeklyTarget && (
              <line
                x1="0"
                y1={140 - (weeklyTarget / weekMax) * 120}
                x2="620"
                y2={140 - (weeklyTarget / weekMax) * 120}
                stroke="var(--color-status-positive-text)"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.55}
              />
            )}
            {bestWeek && (
              <>
                <line
                  x1="0"
                  y1={140 - (bestWeek.earned / weekMax) * 120}
                  x2="620"
                  y2={140 - (bestWeek.earned / weekMax) * 120}
                  stroke="var(--color-amber-light)"
                  strokeWidth={1}
                  opacity={0.6}
                />
                {/* label only when it clears the target label's lane */}
                {(!weeklyTarget ||
                  Math.abs(bestWeek.earned - weeklyTarget) / weekMax > 0.1) && (
                  <text
                    x="616"
                    y={140 - (bestWeek.earned / weekMax) * 120 - 4}
                    textAnchor="end"
                    fontSize={9}
                    fill="var(--color-amber-light)"
                  >
                    best week {money(bestWeek.earned)}
                  </text>
                )}
              </>
            )}
            {weeks.map((w, i) => {
              const h = Math.max(2, (w.earned / weekMax) * 120);
              const x = 10 + i * 76;
              const hit = weeklyTarget ? w.earned >= weeklyTarget : false;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={140 - h}
                    width={56}
                    height={h}
                    rx={4}
                    fill={
                      w.now
                        ? "var(--color-amber-hi)"
                        : hit
                          ? "var(--color-chart-amber)"
                          : "var(--color-plate-b)"
                    }
                  />
                  <text
                    x={x + 28}
                    y={148}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill={w.now ? "var(--color-amber-hi)" : "var(--color-faint)"}
                  >
                    {w.now ? "now" : `$${(w.earned / 1000).toFixed(1)}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </Board>

        {/* rate vs floor — the one and only rate surface */}
        <Board className="ds2-boot p-4">
          <h3 className="ds2-label flex justify-between">
            Rate vs your floor
            {cur != null && (
              <span className="font-condensed font-semibold text-[15px] tracking-normal normal-case text-amber-hi tabular-nums">
                {fmtRpm(cur)}
              </span>
            )}
          </h3>
          <div className="relative h-[64px] mt-4">
            <div className="absolute left-0 right-0 top-[30px] h-[2px] bg-hairline" />
            {ladder.walkAway != null && (
              <div
                className="absolute left-0 top-[30px] h-[2px] bg-status-negative-text opacity-55"
                style={{ width: `${pos(ladder.walkAway)}%` }}
              />
            )}
            {(
              [
                ["walkAway", "Walk-away"],
                ["target", "Target"],
                ["strong", "Strong"],
              ] as const
            ).map(([k, name]) =>
              ladder[k] != null ? (
                <div key={k}>
                  <div
                    className="absolute top-[24px] w-px h-[14px] bg-dim"
                    style={{ left: `${pos(ladder[k])}%` }}
                  />
                  <span
                    className="absolute top-0 -translate-x-1/2 text-[9px] font-semibold tracking-[.1em] uppercase text-faint whitespace-nowrap"
                    style={{ left: `${pos(ladder[k])}%` }}
                  >
                    {name}
                  </span>
                  <span
                    className="absolute top-[44px] -translate-x-1/2 font-condensed font-semibold text-[12px] text-dim tabular-nums"
                    style={{ left: `${pos(ladder[k])}%` }}
                  >
                    {fmtRpm(ladder[k])}
                  </span>
                </div>
              ) : null,
            )}
            {cur != null && (
              <div
                ref={needleRef}
                className="absolute top-[15px] w-[2px] h-[32px] -translate-x-1/2 bg-amber-hi"
                style={{
                  left: `${pos(cur)}%`,
                  boxShadow: "0 0 9px rgba(245,176,58,.8)",
                }}
              />
            )}
          </div>
          <p className="text-[11px] text-dim mt-3">
            {overFloor != null ? (
              overFloor >= 0 ? (
                <>
                  Booking{" "}
                  <b className="text-status-positive-text">
                    {fmtRpm(overFloor)}/mi over break-even
                  </b>{" "}
                  — one soft lane pulls this down fast.
                </>
              ) : (
                <>
                  Booking{" "}
                  <b className="text-status-negative-text">
                    {fmtRpm(Math.abs(overFloor))}/mi under break-even
                  </b>{" "}
                  — you're losing money at this rate.
                </>
              )
            ) : (
              "Set your cost basis to see where your rate lands."
            )}
          </p>
        </Board>
      </div>

      {/* the Next rail + the grind */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
        <Board className="ds2-boot p-4">
          <h3 className="ds2-label mb-1 flex justify-between">
            Next{" "}
            <span className="normal-case tracking-normal font-normal text-faint">
              every clock that matters
            </span>
          </h3>
          {nextRows.length === 0 ? (
            <p className="text-sm text-dim mt-2">Nothing on the clock.</p>
          ) : (
            nextRows.map((r) => (
              <Link
                key={r.kind + r.title}
                to={r.to}
                className="flex items-baseline gap-3 py-[9px] border-b ds2-cell-rule last:border-b-0 hover:opacity-85"
              >
                <span
                  className={`flex-none w-[86px] text-[9px] font-semibold tracking-[.12em] uppercase pt-px ${r.cls}`}
                >
                  {r.kind}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink truncate">
                    {r.title}
                  </span>
                  {r.detail && (
                    <span className="block text-[11px] text-faint mt-px">
                      {r.detail}
                    </span>
                  )}
                </span>
                {r.amount != null && (
                  <span className="ml-auto font-condensed font-semibold text-[14.5px] text-dim tabular-nums whitespace-nowrap">
                    {money(r.amount)}
                  </span>
                )}
              </Link>
            ))
          )}
        </Board>
        <div className="ds2-boot">
          <GrindMeter loads={loads} />
        </div>
      </div>
    </div>
  );
};
