import { useMemo, useRef } from "react";
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
import { getQuarterPace } from "@/lib/metrics/quarterPace";
import { agentStops, scoreStops } from "@/lib/metrics/stopScore";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import type { Alert } from "@/types/alert";
import { GrindMeter } from "@/components/dashboard/GrindMeter";
import { WhatsNext } from "@/components/dashboard/WhatsNext";
import { Board, BoardCell } from "@/components/ui/Board";
import { ForgedPlate } from "@/components/ui/ForgedPlate";
import { CountUp } from "@/components/ui/CountUp";
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

// The pay week as LED segments (gate-3 spec, §04/§06): earned cells solid with
// a hot tip, committed cells dimmed, floor/target as tick markers. Purely a
// re-presentation of numbers the targets hook already provides.
const SEG_CELLS = 26;
const PaceSegments = ({
  earned,
  committed,
  target,
  floor,
}: {
  earned: number;
  committed: number;
  target: number;
  floor: number | null;
}) => {
  const scale = Math.max(target, earned + committed) || 1;
  const cellVal = scale / SEG_CELLS;
  const earnedCells = Math.min(SEG_CELLS, Math.round(earned / cellVal));
  const commitCells = Math.min(
    SEG_CELLS,
    Math.round((earned + committed) / cellVal),
  );

  const Marker = ({ left, label }: { left: number; label: string }) => (
    <div
      className="absolute -top-1.5 w-px h-[31px] bg-dim"
      style={{ left: `${left}%` }}
    >
      <span className="absolute -top-[15px] left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-[.08em] uppercase text-faint whitespace-nowrap">
        {label}
      </span>
    </div>
  );

  return (
    <div className="relative mt-7 mb-1">
      <div className="flex gap-[3px] h-[20px]">
        {Array.from({ length: SEG_CELLS }, (_, i) => {
          const on = i < earnedCells;
          const com = !on && i < commitCells;
          const hotTip = on && i === earnedCells - 1;
          return (
            <span
              key={i}
              className="flex-1 rounded-[2px]"
              style={
                on
                  ? {
                      background: hotTip
                        ? "var(--color-amber-hi)"
                        : "var(--color-chart-amber)",
                      boxShadow: hotTip
                        ? "0 0 7px rgba(245,176,58,.5)"
                        : "inset 0 1px 0 rgba(255,255,255,.15)",
                    }
                  : com
                    ? { background: "rgba(200,127,10,.3)" }
                    : {
                        background: "var(--color-well)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)",
                      }
              }
            />
          );
        })}
      </div>
      {floor != null && floor > 0 && floor <= scale && (
        <Marker left={(floor / scale) * 100} label={`floor ${money(floor)}`} />
      )}
      <Marker
        left={Math.min(100, (target / scale) * 100)}
        label={`target ${money(target)}`}
      />
    </div>
  );
};

export const PulseTab = ({
  loads,
  trips,
  targets,
  alerts,
}: {
  loads: Load[];
  trips: Trip[];
  targets: Targets;
  alerts: Alert[];
}) => {
  const now = useMemo(() => new Date(), []);

  const earned = targets.weekEarned ?? 0;
  const committed = targets.weekBooked ?? 0;
  const weeklyTarget: number | null = targets.gross?.weeklyTarget ?? null;
  const weeklyFloor: number | null = targets.gross?.weeklyBreakEven ?? null;
  const progress = weeklyTarget && weeklyTarget > 0 ? Math.min(1, earned / weeklyTarget) : null;

  const mtd = getRevenueMTD(loads);
  const deadhead = getMonthlyDeadhead(loads, trips).thisMonth;
  const loadsM = getLoadsMonthly(loads);
  const upcoming = getUpcomingLoads(loads);
  const pace = useMemo(() => getQuarterPace(loads, now), [loads, now]);

  // Settlement pipeline: delivered but not yet paid = landing on the next
  // settlement(s). No aging — POD-in (delivered) is the gate, and it clears weekly.
  const pipeline = useMemo(
    () =>
      loads
        .filter((l) => l.load_status === "delivered" && l.payment_status !== "paid")
        .reduce((s, l) => s + loadRevenue(l), 0),
    [loads],
  );

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
    const out: { earned: number; now: boolean }[] = [];
    for (let i = 7; i >= 0; i--) {
      const s = new Date(anchor);
      s.setUTCDate(anchor.getUTCDate() - i * 7);
      const e = new Date(s);
      e.setUTCDate(s.getUTCDate() + 7);
      out.push({ earned: getWeekGrossEarned(loads, s, e), now: i === 0 });
    }
    return out;
  }, [loads, targets.weekStart, now]);
  const weekMax = Math.max(weeklyTarget ?? 0, ...weeks.map((w) => w.earned), 1);

  const ladder = targets.bookingLadder ?? {};
  const cur: number | null = targets.grossRate ?? null;
  const gaugeMax = Math.max(ladder.strong ?? 0, cur ?? 0, ladder.target ?? 0) * 1.15 || 1;
  const pos = (v: number | null | undefined) => (v == null ? 0 : Math.min(100, (v / gaugeMax) * 100));
  const overFloor = cur != null && ladder.walkAway != null ? cur - ladder.walkAway : null;

  const paceMeta = PACE[pace.verdict];

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
          </p>
          {weeklyTarget ? (
            <PaceSegments
              earned={earned}
              committed={committed}
              target={weeklyTarget}
              floor={weeklyFloor}
            />
          ) : null}
          <p className="text-[11.5px] text-faint mt-1.5">
            {progress != null && weeklyTarget ? (
              <>
                <b className="text-ink">{Math.round(progress * 100)}%</b> of your{" "}
                <b className="text-ink">{money(weeklyTarget)}</b> weekly target ·{" "}
              </>
            ) : null}
            <b className="text-dim">{money(committed)}</b> committed & booked ahead
          </p>
        </div>
        <div className="md:border-l md:border-white/10 md:pl-5 flex flex-col justify-center gap-3">
          <div>
            <p
              className="font-condensed font-semibold text-[22px] leading-none tabular-nums"
              style={{
                color:
                  overFloor != null && overFloor >= 0
                    ? "var(--color-status-positive-text)"
                    : "var(--color-ink)",
              }}
            >
              {cur != null ? `${fmtRpm(cur)}/mi` : "—"}
            </p>
            <p className="ds2-label mt-1">
              gross rate
              {overFloor != null
                ? ` · ${overFloor >= 0 ? "+" : "−"}${fmtRpm(Math.abs(overFloor))} vs floor`
                : ""}
            </p>
          </div>
          <div>
            <p className="font-condensed font-semibold text-[22px] leading-none tabular-nums">
              {money(mtd)}
            </p>
            <p className="ds2-label mt-1">earned month-to-date</p>
          </div>
          <p className="text-[11px] font-bold" style={{ color: paceMeta.color }}>
            {paceMeta.glyph} {pace.label} {paceMeta.text} {pace.prevLabel}
          </p>
        </div>
      </ForgedPlate>

      {/* vital signs — the etched board (flat = read) */}
      <Board className="ds2-boot grid grid-cols-2 md:grid-cols-5">
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Loads · MTD"
          value={String(loadsM.thisMonth)}
          sub={`last month ${loadsM.lastMonth}`}
        />
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Deadhead"
          value={deadhead != null ? `${Math.round(deadhead * 100)}%` : "—"}
          sub="odometer-true"
          tone={deadhead == null ? "none" : deadhead <= 0.2 ? "pos" : "amb"}
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
        />
        <BoardCell
          className="md:border-r ds2-cell-rule"
          label="Pipeline"
          value={money(pipeline)}
          sub="delivered, not yet settled"
        />
        <BoardCell
          label="On-time"
          value={
            onTime.onTimePct != null ? `${Math.round(onTime.onTimePct * 100)}%` : "—"
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
        />
      </Board>

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3">
        {/* weekly earnings */}
        <Board className="ds2-boot p-4">
          <h3 className="ds2-label mb-2 flex justify-between">
            Weekly earnings{" "}
            <span className="normal-case tracking-normal font-normal text-faint">
              last 8 weeks · gross
            </span>
          </h3>
          <svg viewBox="0 0 620 150" className="w-full">
            {weeklyTarget && (
              <>
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
                <text
                  x="616"
                  y={140 - (weeklyTarget / weekMax) * 120 - 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--color-status-positive-text)"
                >
                  target {money(weeklyTarget)}
                </text>
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

        {/* rate vs floor — the scale instrument */}
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

      {/* what's next + the grind */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
        <Board className="ds2-boot p-4">
          <h3 className="ds2-label mb-2 flex justify-between">
            What's next{" "}
            <span className="normal-case tracking-normal font-normal text-faint">
              booked · picking up
            </span>
          </h3>
          <WhatsNext loads={upcoming} />
        </Board>
        <div className="ds2-boot">
          <GrindMeter loads={loads} />
        </div>
      </div>
    </div>
  );
};
