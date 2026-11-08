import { useMemo, type ReactNode } from "react";
import { DEADHEAD_TARGET } from "@/lib/constants/targets";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { getMonthlyDeadhead, getUpcomingLoads, getDetentionOwed } from "@/lib/metrics/dashboard";
import { loadRevenue } from "@/lib/metrics/loads";
import { loadNetRevenue as loadNet } from "@/lib/metrics/rateTargets";
import { agentStops, scoreStops } from "@/lib/metrics/stopScore";
import { projectWeek } from "@/lib/metrics/weekProjection";
import { nextSettlementDate } from "@/lib/metrics/settlement";
import { profitRows, ytdSummary, lastFiledMonth, monthIsFiled } from "@/lib/metrics/profitSummary";
import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import { useLocalToday } from "@/hooks/useLocalToday";
import type { OwnerFeedsState } from "@/hooks/useOwnerFeeds";
import type { usePlanStatus } from "@/hooks/usePlanStatus";
import type { CashBoard, DepositLine } from "@/lib/metrics/cashBoard";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import type { Alert } from "@/types/alert";
import { Board, BoardCell } from "@/components/ui/Board";
import { Panel } from "@/components/ui/Panel";
import { CashPlate } from "@/components/dashboard/pulse/CashPlate";
import { dayWords } from "@/components/dashboard/pulse/words";
import { DepositFigure, WeekCard, ProfitCard } from "@/components/dashboard/pulse/WeekCards";
import { DetentionCard } from "@/components/dashboard/pulse/DetentionCard";
import { FloorsCard, LeaveCard, StageCard } from "@/components/dashboard/pulse/LongGame";
import { useBasisWindow } from "@/hooks/useBasisWindow";
import { burnFromPeriods } from "@/lib/metrics/sitCost";
import { leaveReserve } from "@/lib/metrics/leaveReserve";
import { money, rpm as fmtRpm } from "@/lib/format";
import { isDelivered } from "@/lib/metrics/status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Targets = any; // the useRateTargets shape (weekEarned/weekBooked/gross/bookingLadder/grossRate)

// Weekday + date in UTC — date-only strings must never shift a day locally.
const fmtDay = (d: Date): string =>
  d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const fmtDayIso = (iso: string): string => fmtDay(new Date(iso));

const MONTH_LONG = (k: string): string =>
  new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

// One band of the page: an eyebrow, a hairline above (all but the first), and
// a 12-column grid on a laptop — a single column on the phone, in order.
const Band = ({ label, first = false, children }: { label: string; first?: boolean; children: ReactNode }) => (
  <section className={first ? "" : "border-t border-hairline pt-4"}>
    <h2 className="text-[11px] uppercase tracking-wider text-muted-text mb-2">{label}</h2>
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">{children}</div>
  </section>
);

// A planning input that is blank or not a number is unknown, never 0.
const numberOrNull = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

export const PulseTab = ({
  loads,
  trips,
  targets,
  alerts,
  feeds,
  cash,
  plan,
  nextDeposit = null,
}: {
  loads: Load[];
  trips: Trip[];
  targets: Targets;
  alerts: Alert[];
  feeds: OwnerFeedsState; // the rows the cash board and the plan read
  cash: { board: CashBoard | null; floatLine: number | null };
  plan: ReturnType<typeof usePlanStatus>;
  nextDeposit?: DepositLine | null; // the cash board's figure for the next landing
}) => {
  // The operator's local day, anchored, rolling at midnight (call 13).
  const now = useLocalToday();
  const todayKey = now.toISOString().slice(0, 10);
  const settlementDay = feeds.schedule?.settlement_day ?? null;

  // ---- BAND 1 · the pay week ----
  const booked: number = targets.weekBooked ?? 0;
  const weeklyTarget: number | null = targets.gross?.weeklyTarget ?? null;
  // Each load counted once, by its delivery date inside the pay week.
  const week = useMemo(
    () => (targets.weekStart ? projectWeek(loads, new Date(targets.weekStart)) : null),
    [loads, targets.weekStart],
  );
  const weekEndMs = targets.weekStart ? new Date(targets.weekStart).getTime() + 7 * 86_400_000 : null;
  const daysLeft = weekEndMs != null ? Math.max(0, Math.round((weekEndMs - now.getTime()) / 86_400_000)) : null;
  const bookedFor =
    week && week.incomingFirst
      ? week.incomingFirst === week.incomingLast
        ? dayWords(week.incomingFirst)
        : `${dayWords(week.incomingFirst)} – ${dayWords(week.incomingLast as string)}`
      : null;

  // ---- BAND 1 · profit (the one P&L lib the Money tab also reads) ----
  const pnl = useMemo(() => {
    const rows = profitRows(feeds.periods, targets.obligationsMonthly ?? 0);
    return {
      rows,
      summary: ytdSummary(rows, now.getUTCFullYear()),
      last: lastFiledMonth(rows),
      currentFiled: monthIsFiled(rows, todayKey),
    };
  }, [feeds.periods, targets.obligationsMonthly, now, todayKey]);

  // ---- BAND 2 · the instruments ----
  const deadhead = getMonthlyDeadhead(loads, trips, now).thisMonth;
  const upcoming = getUpcomingLoads(loads);

  // Landing on the next weekly settlement: delivered, POD in, not yet paid —
  // the fallback for the deposit figure while the cash board has none.
  const pipelineLoads = useMemo(
    () => loads.filter((l) => isDelivered(l) && l.payment_status !== "paid"),
    [loads],
  );
  const pipeline = useMemo(() => pipelineLoads.reduce((s, l) => s + loadNet(l), 0), [pipelineLoads]);
  const settleDate = settlementDay != null ? nextSettlementDate(now, settlementDay) : null;

  // Your delivery punctuality — did YOU hit the appointment at the dock — over the
  // last 90 days of delivered loads. null until 3 graded.
  const onTime = useMemo(() => {
    const cutoff = now.getTime() - 90 * 86_400_000;
    const recent = loads.filter(
      (l) => isDelivered(l) && l.delivery_date && new Date(l.delivery_date).getTime() >= cutoff,
    );
    return scoreStops(agentStops(recent, 3));
  }, [loads, now]);

  const ladder = targets.bookingLadder ?? {};
  const cur: number | null = targets.grossRate ?? null;
  // Floor-anchored scale, per the approved mockup: the track starts a step
  // below walk-away and ends a step past the top, so the ladder spreads the
  // full width. Padding keeps centered labels from clipping at either edge.
  const gaugeHi = Math.max(ladder.strong ?? 0, cur ?? 0, ladder.target ?? 0) || 1;
  const gaugeLo = Math.min(ladder.walkAway ?? gaugeHi, cur ?? gaugeHi);
  const span = Math.max(gaugeHi - gaugeLo, gaugeHi * 0.1);
  const lo = gaugeLo - span * 0.16;
  const hi = gaugeHi + span * 0.1;
  const pos = (v: number | null | undefined) =>
    v == null ? 0 : Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const overFloor = cur != null && ladder.walkAway != null ? cur - ladder.walkAway : null;

  // ---- BAND 3 · on the clock ----
  const freeHours = feeds.schedule?.detention_free_hours ?? DEFAULT_DETENTION_FREE_HOURS;
  const detention = useMemo(() => getDetentionOwed(loads, freeHours), [loads, freeHours]);

  // The Next rail — every clock that matters, one list. Rows self-omit when
  // there's nothing on that clock; each row is a door.
  // Band 4 · the leave reserve: the Vault in weeks of a parked truck. The sit
  // cost blends the basis window's full periods — the function the Expenses
  // page prints — plus the weekly payroll; the horizon is the plan's.
  const basisWindow = useBasisWindow(feeds.periods, targets.basis.monthsDetail);
  const obligationsTotal = useMemo(
    () => feeds.obligations.filter((o) => o.active && !o.on_pl).reduce((s, o) => s + Number(o.amount), 0),
    [feeds.obligations],
  );
  const sit = useMemo(() => burnFromPeriods(basisWindow.windowFull, obligationsTotal), [basisWindow.windowFull, obligationsTotal]);
  const weeklyPayroll = numberOrNull(feeds.assumptions?.weekly_payroll);
  const leaveWeeks = plan.plan?.leave_weeks ?? null;
  const leave = leaveReserve({ vault: plan.vaultBalance, weeklyPayroll, sit, weeks: leaveWeeks });
  const cushion = useMemo(() => {
    const vaults = (plan.plan?.stages ?? []).filter((st) => st.kind === "vault" && st.position > 1).sort((a, b) => a.position - b.position);
    return vaults.length > 0 ? vaults[vaults.length - 1] : null;
  }, [plan.plan]);

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
      .sort((a, b) => ((a.delivery_date as string) < (b.delivery_date as string) ? -1 : 1))[0];
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
        cls: "text-status-info-text",
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

  return (
    <div className="flex flex-col gap-4">
      {alerts.length > 0 && <AlertBanners alerts={alerts} />}

      <Band label="THE BOTTOM LINE" first>
        {/* the hero plate: two figures side by side */}
        <Panel className="md:col-span-6 p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <CashPlate
            board={cash.board}
            floatLine={cash.floatLine}
            loading={feeds.loading}
            failed={feeds.failed}
            retry={feeds.retry}
            assumptionsMissing={!feeds.loading && feeds.failed.length === 0 && feeds.assumptions == null}
          />
          <DepositFigure
            nextDeposit={nextDeposit}
            pipelineFallback={{ amount: pipeline, loads: pipelineLoads.length, lands: settleDate ? fmtDay(settleDate) : null }}
          />
        </Panel>
        <div className="md:col-span-3">
          <WeekCard
            booked={booked}
            target={weeklyTarget}
            delivered={week ? week.deliveredCount : null}
            bookedAhead={week ? week.incomingCount : null}
            bookedFor={bookedFor}
            daysLeft={daysLeft}
            projected={week ? week.projected : null}
          />
        </div>
        <div className="md:col-span-3">
          <ProfitCard
            year={now.getUTCFullYear()}
            summary={pnl.summary}
            last={pnl.last}
            currentMonthFiled={pnl.currentFiled}
            currentMonthName={MONTH_LONG(todayKey)}
            marginGoal={targets.marginGoal ?? null}
            loading={feeds.loading}
            hasRows={pnl.rows.length > 0}
            fetchFailed={feeds.failed.includes("the P&L")}
            retry={feeds.retry}
          />
        </div>
      </Band>

      <Band label="PRICED AND RUNNING RIGHT">
        {/* rate vs floor — the one and only rate surface */}
        <Board className="md:col-span-3 p-4">
          <h3 className="ds2-label flex justify-between">
            Rate vs your floor
            {cur != null && (
              <span className="font-condensed font-semibold text-[15px] tracking-normal normal-case text-amber-hi tabular-nums">
                {fmtRpm(cur)}
              </span>
            )}
          </h3>
          <div className="relative h-[48px] mt-3">
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
                <div
                  key={k}
                  title={`${name} ${fmtRpm(ladder[k])}`}
                  className="absolute top-[24px] w-px h-[14px] bg-dim"
                  style={{ left: `${pos(ladder[k])}%` }}
                />
              ) : null,
            )}
            {cur != null && (
              <div
                className="absolute top-[15px] w-[2px] h-[32px] -translate-x-1/2 bg-amber-hi"
                style={{
                  left: `${pos(cur)}%`,
                  boxShadow: "0 0 9px color-mix(in srgb, var(--color-amber-hi) 80%, transparent)",
                }}
              />
            )}
          </div>
          <p className="text-[10.5px] text-faint mt-1.5 font-condensed tracking-[.04em] tabular-nums">
            {(
              [
                ["walkAway", "walk-away"],
                ["target", "target"],
                ["strong", "strong"],
              ] as const
            )
              .filter(([k]) => ladder[k] != null)
              .map(([k, name], i) => (
                <span key={k}>
                  {i > 0 ? " · " : ""}
                  {name} <b className="text-dim">{fmtRpm(ladder[k])}</b>
                </span>
              ))}
          </p>
          <p className="text-[11px] text-dim mt-2">
            {overFloor != null ? (
              overFloor >= 0 ? (
                <>
                  Booking{" "}
                  <b className="text-status-positive-text">{fmtRpm(overFloor)}/mi over break-even</b>{" "}
                  — one soft lane pulls this down fast.
                </>
              ) : (
                <>
                  Booking{" "}
                  <b className="text-status-negative-text">{fmtRpm(Math.abs(overFloor))}/mi under break-even</b>{" "}
                  — you're losing money at this rate.
                </>
              )
            ) : (
              "Set your cost basis to see where your rate lands."
            )}
          </p>
        </Board>
        <Board className="md:col-span-3">
          <BoardCell
            label="Deadhead"
            value={deadhead != null ? `${Math.round(deadhead * 100)}%` : "—"}
            sub="odometer-true · target ≤ 20%"
            tone={deadhead == null ? "none" : deadhead <= DEADHEAD_TARGET ? "pos" : "amb"}
            to="/trips"
            go="trips"
          />
        </Board>
        <Board className="md:col-span-3">
          <BoardCell
            label="Net $/loaded mi"
            value={targets.rollingRpm != null ? fmtRpm(targets.rollingRpm) : "—"}
            sub={
              targets.basis?.breakEvenRpm != null
                ? `net break-even ${fmtRpm(targets.basis.breakEvenRpm)}/loaded mi · cash · ${targets.basis.windowLabel ?? "no P&L"}`
                : "needs a P&L month"
            }
            to="/settings"
            go="cost basis"
          />
        </Board>
        <Board className="md:col-span-3">
          <BoardCell
            label="On-time"
            value={onTime.onTimePct != null ? `${Math.round(onTime.onTimePct * 100)}%` : "—"}
            sub={
              onTime.onTimePct != null
                ? `${onTime.gradedStops} graded stops · 90d`
                : "needs 3+ graded stops"
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
        </Board>
      </Band>

      <Band label="ON THE CLOCK">
        <Board className="md:col-span-8 p-4">
          <h3 className="ds2-label mb-1 flex justify-between">
            Next{" "}
            <span className="normal-case tracking-normal font-normal text-faint">every clock that matters</span>
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
                <span className={`flex-none w-[86px] text-[9px] font-semibold tracking-[.12em] uppercase pt-px ${r.cls}`}>
                  {r.kind}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink truncate">{r.title}</span>
                  {r.detail && <span className="block text-[11px] text-faint mt-px">{r.detail}</span>}
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
        <div className="md:col-span-4">
          <DetentionCard owed={detention} freeHours={freeHours} />
        </div>
      </Band>

      <Band label="THE LONG GAME · THE PLAN">
        <div className="md:col-span-5">
          <FloorsCard
            status={plan.status}
            plan={plan.plan}
            latest={plan.latestSnapshot}
            taxBalance={plan.taxBalance}
            opsCheckDate={plan.opsCheckDate}
            loading={plan.loading}
            failed={plan.failed}
            retry={plan.retry}
          />
        </div>
        <div className="md:col-span-4">
          <StageCard
            status={plan.status}
            plan={plan.plan}
            obligById={plan.obligById}
            obligations={feeds.obligations}
            now={now}
            loading={plan.loading}
            failed={plan.failed}
            retry={plan.retry}
          />
        </div>
        <div className="md:col-span-3">
          <LeaveCard
            reserve={leave}
            vault={plan.vaultBalance}
            weeks={leaveWeeks}
            sit={sit}
            weeklyPayroll={weeklyPayroll}
            cushion={cushion}
            loading={plan.loading || basisWindow.loading}
            failed={[...plan.failed, ...(basisWindow.failed ? ["the cost basis months"] : [])]}
            retry={() => {
              plan.retry();
              basisWindow.retry();
            }}
          />
        </div>
      </Band>
    </div>
  );
};
