import { useMemo } from "react";
import { MARGIN_GOAL } from "@/lib/constants/targets";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { useExpensePeriods } from "@/hooks/useExpensePeriods";
import { useLocalToday } from "@/hooks/useLocalToday";
import { topCategoriesWithOther } from "@/lib/metrics/expenses";
import { Board, BoardCell } from "@/components/ui/Board";
import { Panel } from "@/components/ui/Panel";
import { PaceMeter, paceMarker, type PaceMarker } from "@/components/ui/PaceMeter";
import { monthCoverage } from "@/lib/metrics/monthCoverage";
import { profitRows, ytdRows, ytdSummary, monthsAtGoal } from "@/lib/metrics/profitSummary";
import { getSeasonStats } from "@/lib/metrics/playerCard";
import { bestPayWeek, weekLabel } from "@/lib/metrics/payWeeks";
import { quarterWeekVerdicts } from "@/lib/metrics/grind";
import { getWeekGrossEarned, payWeekRange, type RateTargets } from "@/lib/metrics/rateTargets";
import { PAY_WEEK_START_DOW, DEADHEAD_TARGET } from "@/lib/constants/targets";
import { weeksWords } from "./weeksWords";
import { money, rpm } from "@/lib/format";

// The month's story: P&L, the two margins, where it goes, and THE MONTH. Pulse
// chases the week; Money chases the month and keeps the series behind it — the
// weekly earnings with the best week, the last complete quarter. Plain since the
// Redesign's phase B1: the BEST MONTH chip, the MONTH COVERED stamp and the
// goal streak were the game's; the months at the goal are a count.
// No settlement-pipeline section: the carrier clears it weekly (BCO reality),
// so that beat lives on Pulse's Next rail as timing, not receivables.

const WEEK_MS = 7 * 86400000;

const Stat = ({
  label,
  value,
  sub,
  tone = "",
  wrap = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  wrap?: boolean; // a name (a lane) wraps; a figure never does
}) => (
  <div className="min-w-0">
    <p className="ds2-label">{label}</p>
    <p className={`font-condensed font-semibold mt-1.5 tabular-nums ${wrap ? "text-[17px] leading-tight" : "text-[22px] leading-none truncate"} ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-faint mt-1 leading-snug">{sub}</p>}
  </div>
);

// Fixed-order categorical palette — validated 2026-08-09 (see index.css).
const CAT_VARS = [
  "var(--color-cat1)",
  "var(--color-cat2)",
  "var(--color-cat3)",
  "var(--color-cat4)",
  "var(--color-cat5)",
  "var(--color-cat6)",
];
const OTHER_COLOR = "var(--color-plate-a)"; // "Other" is a neutral bucket, not a series
const segColor = (category: string, i: number) =>
  category === "Other" ? OTHER_COLOR : CAT_VARS[i % CAT_VARS.length];

const monthShort = (m: string) =>
  new Date(m.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const MoneyTab = ({
  loads,
  trips,
  targets,
  marginGoal,
  obligationsMonthly,
}: {
  loads: Load[];
  trips: Trip[];
  targets: RateTargets; // the one basis — the weekly target and floor, the pay week
  marginGoal: number | null;
  obligationsMonthly: number; // active, non-draw monthly notes (principal) — interest is already in the P&L
}) => {
  const { periods, categoriesYTD, loading } = useExpensePeriods();
  // The operator's local day, anchored, rolling at midnight (call 13).
  const now = useLocalToday();
  const year = now.getUTCFullYear();

  // The P&L arithmetic lives in lib/metrics/profitSummary.ts — one truth with
  // Pulse's "Profit · year to date" card (Cockpit PR 1).
  const rows = useMemo(() => profitRows(periods, obligationsMonthly), [periods, obligationsMonthly]);
  const ytd = useMemo(() => ytdRows(rows, year), [rows, year]);
  const summary = useMemo(() => ytdSummary(rows, year), [rows, year]);
  const ytdIncome = summary.income;
  const ytdProfit = summary.profit;
  const ytdMargin = summary.margin;
  const ytdCashMargin = summary.cashMargin;
  // ONE margin on this tab (2026-11-04, §5): after notes — the one the goal
  // grades. The bars and the tile read it; the operating margin stays beside
  // it as a named figure, never graded.

  // Realized per-mile economics — the year's income and all-in cost (P&L cost +
  // note principal) spread over odometer-true miles from loads and trips.
  const miles = useMemo(() => {
    const yr = String(year);
    const d = (s: number | null | undefined, e: number | null | undefined) =>
      s != null && e != null && e > s ? e - s : 0;
    const fromLoads = loads
      .filter((l) => l.delivery_date?.startsWith(yr))
      .reduce((sum, l) => sum + d(l.odometer_start, l.odometer_end), 0);
    const fromTrips = trips
      .filter((t) => t.trip_date?.startsWith(yr))
      .reduce((sum, t) => sum + d(t.odometer_start, t.odometer_end), 0);
    return fromLoads + fromTrips;
  }, [loads, trips, year]);
  const revPerMi = miles > 0 && ytdIncome > 0 ? ytdIncome / miles : null;
  const costPerMi =
    miles > 0 && ytdIncome > 0
      ? (ytdIncome - summary.trueNet) / miles
      : null;
  const profitPerMi =
    revPerMi != null && costPerMi != null ? revPerMi - costPerMi : null;

  // COVERING THE MONTH (Jason, 2026-08-10: "one load will cover my notes" —
  // the real metric is the monthly expense threshold and the margin over it).
  // Income races the MEAN monthly cost; the notes ride as the last slice under
  // the threshold. One shared computation with the player card.
  const latest = rows[rows.length - 1] ?? null;
  void latest;
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cov = useMemo(
    () => monthCoverage(periods, obligationsMonthly, loads, now, trips),
    [periods, obligationsMonthly, loads, now, trips],
  );
  const projIncome =
    cov.income > 0 && dayOfMonth > 0 ? (cov.income / dayOfMonth) * daysInMonth : null;
  const coverDate =
    cov.coverDay != null
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), cov.coverDay))
      : null;

  const meterMarkers: PaceMarker[] = [
    ...(cov.opEx != null && cov.opEx > 0
      ? [paceMarker("expenses", Math.round(cov.opEx))]
      : []),
    ...(cov.threshold != null ? [paceMarker("month", Math.round(cov.threshold))] : []),
  ];
  const meterTarget = cov.threshold ?? Math.max(cov.income, 1);

  // Months at or above the goal this year — a count, never a streak.
  const atGoal = useMemo(() => monthsAtGoal(ytd, marginGoal), [ytd, marginGoal]);

  // The last COMPLETE calendar quarter — the driver card's season grid, now a
  // plain row here (the Cockpit, §1c). Debt obligations only, as the P&L's
  // note principal.
  const season = useMemo(
    () => getSeasonStats(periods, loads, trips, now, obligationsMonthly),
    [periods, loads, trips, now, obligationsMonthly],
  );

  // The last eight pay weeks (Wednesday → Tuesday), gross earned — delivered
  // freight only — anchored on the basis's own pay week; and the best completed
  // pay week ever, the one figure the Pulse used to count up to.
  const weekAnchor = targets.weekStart ?? payWeekRange(now, PAY_WEEK_START_DOW).start;
  const weeks = useMemo(() => {
    const out: { start: Date; earned: number; now: boolean }[] = [];
    for (let i = 7; i >= 0; i--) {
      const s = new Date(weekAnchor.getTime() - i * WEEK_MS);
      out.push({ start: s, earned: getWeekGrossEarned(loads, s, new Date(s.getTime() + WEEK_MS)), now: i === 0 });
    }
    return out;
  }, [loads, weekAnchor]);
  const bestWeek = useMemo(() => bestPayWeek(loads, now.toISOString().slice(0, 10)), [loads, now]);
  const quarter = useMemo(
    () => weeksWords(quarterWeekVerdicts(loads, targets.gross, now)),
    [loads, targets.gross, now],
  );
  const weeklyTarget = targets.gross?.weeklyTarget ?? null;
  const weeklyFloor = targets.gross?.weeklyBreakEven ?? null;

  // "Where it goes" — the year's spending by category (backend rollup), top 6 +
  // Other. Profit is derived from the same category total so the bar sums to 100%.
  const cats = useMemo(() => topCategoriesWithOther(categoriesYTD, 6), [categoriesYTD]);
  const catCost = useMemo(
    () => categoriesYTD.reduce((s, c) => s + c.amount, 0),
    [categoriesYTD],
  );
  const catProfit = Math.max(0, ytdIncome - catCost);
  // Widths share a denominator so profit + categories always sum to 100% — even
  // in the rare month where booked cost outruns counted income.
  const denom = Math.max(ytdIncome, catCost);
  const pctOf = (amt: number) => (denom > 0 ? (amt / denom) * 100 : 0);

  if (loading)
    return (
      <div className="text-sm text-dim py-12 text-center">Loading your P&amp;L…</div>
    );
  if (rows.length === 0)
    return (
      <div className="text-sm text-dim py-12 text-center">
        No P&amp;L yet.{" "}
        <Link to="/expenses" className="text-status-info-text hover:underline">
          Add a month on the Expenses page
        </Link>{" "}
        to light this up.
      </div>
    );

  const barMax = Math.max(...rows.map((r) => r.income), 1);
  const H = 128;
  const bars = rows.slice(-8);
  // Cap the column width so a 1–2 month view doesn't render giant bars; center
  // the group when there are fewer than a full year of months.
  const colW = Math.min(96, 620 / bars.length);
  const x0 = (620 - colW * bars.length) / 2;

  return (
    <div className="flex flex-col gap-3">
      {/* the year, in four numbers — every cell a door */}
      <Board className="grid grid-cols-2 md:grid-cols-4">
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label={`Income · ${year}`}
          value={money(ytdIncome)}
          sub={`${ytd.length} month${ytd.length === 1 ? "" : "s"} · net of carrier cut · the P&L upload`}
          to="/recap"
          go="recap"
        />
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Operating profit"
          value={money(ytdProfit)}
          valueClassName={ytdProfit >= 0 ? "text-status-positive-text" : "text-status-negative-text"}
          sub="income − COGS − expenses · the P&L upload (the Cash Flow archive is QBO)"
          tone={ytdProfit >= 0 ? "pos" : "neg"}
          to="/expenses"
          go="expenses"
        />
        <BoardCell
          className="md:border-r ds2-cell-rule"
          label="Margin · after notes"
          value={ytdCashMargin != null ? `${Math.round(ytdCashMargin * 100)}%` : "—"}
          valueClassName={
            ytdCashMargin != null && marginGoal != null
              ? ytdCashMargin >= marginGoal
                ? "text-status-positive-text"
                : "text-amber-light"
              : ""
          }
          sub={
            marginGoal != null && ytdCashMargin != null
              ? `${ytdCashMargin >= marginGoal ? "▲ above" : "under"} ${Math.round(marginGoal * 100)}% goal${ytdMargin != null ? ` · ${Math.round(ytdMargin * 100)}% operating` : ""}`
              : ytdMargin != null
                ? `${Math.round(ytdMargin * 100)}% operating`
                : "after truck/trailer notes"
          }
          tone={
            ytdCashMargin != null && marginGoal != null
              ? ytdCashMargin >= marginGoal
                ? "pos"
                : "amb"
              : "none"
          }
          to="/expenses"
          go="expenses"
        />
        <BoardCell
          label="Profit per mile · realized"
          value={profitPerMi != null ? rpm(profitPerMi) : "—"}
          sub={
            revPerMi != null && costPerMi != null
              ? `rev ${rpm(revPerMi)} − all-in ${rpm(costPerMi)} /mi`
              : "needs odometer readings"
          }
          tone={profitPerMi != null && profitPerMi > 0 ? "pos" : "none"}
          to="/settings"
          go="cost basis"
        />
      </Board>

      {/* THE NOTES — the month's chase against its cost threshold */}
      <Panel className="p-5">
        {cov.threshold != null ? (
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
            <div>
              <p className="ds2-label">
                {cov.monthLabel} — covering the month
                {cov.estimated ? " · estimated" : ""}
              </p>
              <p className="font-display text-[34px] tracking-[.02em] leading-none mt-1.5 tabular-nums">
                {money(cov.income)}{" "}
                <span className="text-[15px] text-dim font-condensed tracking-normal">
                  income so far{cov.estimated ? " · est." : ""}
                </span>
              </p>
              <PaceMeter
                filled={Math.max(0, cov.income)}
                target={meterTarget}
                markers={meterMarkers}
              />
              <p className="text-[11.5px] text-faint mt-1.5">
                {cov.covered ? (
                  <>
                    Month <b className="text-status-positive-text">covered</b> —{" "}
                    <b className="text-status-positive-text">
                      {money(cov.marginOver ?? 0)}
                    </b>{" "}
                    margin over the threshold
                    {cov.notes > 0 ? " — the notes rode inside it" : ""}.
                  </>
                ) : (
                  <>
                    <b className="text-ink">{money(cov.short ?? 0)}</b> short of the{" "}
                    {money(cov.threshold ?? 0)} month{cov.windowLabel ? ` (the ${cov.windowLabel} mean)` : ""}
                    {cov.notes > 0 ? (
                      <>
                        {" "}
                        (expenses {money(cov.opEx ?? 0)} + notes {money(cov.notes)})
                      </>
                    ) : null}
                    {coverDate ? (
                      <>
                        {" "}
                        · on pace to cover it <b className="text-ink">{fmtDay(coverDate)}</b>
                      </>
                    ) : null}
                    {" "}— past it, every dollar is margin.
                  </>
                )}
                {cov.estimated && (
                  <>
                    {" "}
                    <span className="text-faint">
                      Month-to-date income from delivered loads — the real P&amp;L
                      takes over when the month posts.
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="md:border-l md:border-hairline md:pl-6 flex flex-col justify-center gap-3.5">
              <div>
                <p className="ds2-label">Month projection · straight-line</p>
                <p className="font-condensed font-semibold text-[21px] leading-none tabular-nums mt-1">
                  {projIncome != null ? money(projIncome) : "—"}{" "}
                  <span className="text-[13px] text-faint">income</span>
                </p>
              </div>
              <div>
                <p className="ds2-label">Days left in month</p>
                <p className="font-condensed font-semibold text-[21px] leading-none tabular-nums mt-1">
                  {daysInMonth - dayOfMonth}
                </p>
              </div>
              <div>
                <p className="ds2-label">Against the threshold</p>
                {cov.covered ? (
                  <p className="font-condensed font-semibold text-[21px] leading-none tabular-nums mt-1 text-status-positive-text">
                    covered · {money(cov.marginOver ?? 0)} over
                  </p>
                ) : (
                  <p className="font-condensed font-semibold text-[21px] leading-none tabular-nums mt-1">
                    {money(cov.short ?? 0)} <span className="text-[13px] text-faint font-normal">short</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="ds2-label">{cov.monthLabel} — covering the month</p>
            <p className="text-sm text-dim mt-2">
              The threshold comes from your P&L — post a month of expenses and the
              meter reads against your mean monthly cost.
            </p>
            <Link
              to="/expenses"
              className="inline-block mt-3 text-[13px] font-condensed font-semibold text-amber-hi"
            >
              Add the month on Expenses →
            </Link>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
        {/* monthly P&L */}
        <Board className="p-4">
          <h3 className="ds2-label mb-1 flex justify-between">
            Monthly P&amp;L
            <span className="normal-case tracking-normal font-normal text-faint">
              <span style={{ color: "var(--color-plate-a)" }}>■</span> income{" "}
              <span className="text-chart-amber">■</span> profit kept · margin after notes % below
            </span>
          </h3>
          <svg viewBox="0 0 620 168" className="w-full">
            <line x1="0" y1="140" x2="620" y2="140" stroke="var(--color-hairline-lo)" />
            {bars.map((r, i) => {
              const incH = Math.max(2, (r.income / barMax) * H);
              const proH = Math.max(0, (Math.max(0, r.profit) / barMax) * H);
              const x = x0 + i * colW + colW * 0.14;
              const w = colW * 0.72;
              const cx = x0 + i * colW + colW / 2;
              const isNow = i === bars.length - 1;
              return (
                <g key={r.month} textAnchor="middle" fontSize={8.5}>
                  <rect
                    x={x}
                    y={140 - incH}
                    width={w}
                    height={incH}
                    rx={4}
                    fill="var(--color-plate-a)"
                  />
                  {r.profit > 0 && (
                    <rect
                      x={x}
                      y={140 - proH}
                      width={w}
                      height={proH}
                      rx={4}
                      fill={isNow ? "var(--color-amber-hi)" : "var(--color-chart-amber)"}
                    />
                  )}
                  <text x={cx} y={152} fill={isNow ? "var(--color-amber-hi)" : "var(--color-faint)"}>
                    {monthShort(r.month)}
                  </text>
                  <text
                    x={cx}
                    y={163}
                    // Same bands as every margin grader: red under the goal,
                    // green at goal +5pts (strong) — never a hardcoded 20/30.
                    // The margin AFTER NOTES, the one the tile grades — the bars
                    // used to grade the operating margin against the same goal.
                    fill={
                      r.cashMargin < (marginGoal ?? MARGIN_GOAL)
                        ? "var(--color-status-negative-text)"
                        : r.cashMargin >= (marginGoal ?? MARGIN_GOAL) + 0.05
                          ? "var(--color-status-positive-text)"
                          : "var(--color-dim)"
                    }
                    fontWeight={isNow ? 700 : 400}
                  >
                    {Math.round(r.cashMargin * 100)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </Board>

        {/* margin trend — operating vs after-notes, against the goal */}
        <Board className="p-4">
          <h3 className="ds2-label mb-2 flex justify-between items-center">
            Margin trend
            <span className="normal-case tracking-normal font-normal flex gap-2.5 text-[10px] items-center">
              <span className="text-chart-amber">● after notes</span>
              <span className="text-chart-blue">● operating</span>
            </span>
          </h3>
          <svg viewBox="0 0 320 140" className="w-full">
            {marginGoal != null && (
              <>
                <line
                  x1="8"
                  y1={120 - marginGoal * 220}
                  x2="312"
                  y2={120 - marginGoal * 220}
                  stroke="var(--color-status-positive-text)"
                  strokeDasharray="4 4"
                  opacity={0.5}
                />
                <text
                  x="310"
                  y={120 - marginGoal * 220 - 3}
                  textAnchor="end"
                  fontSize={8.5}
                  fill="var(--color-status-positive-text)"
                >
                  {Math.round(marginGoal * 100)}% goal
                </text>
              </>
            )}
            <polyline
              fill="none"
              stroke="var(--color-chart-blue)"
              strokeWidth={2}
              points={rows
                .map(
                  (r, i) =>
                    `${8 + (i / Math.max(1, rows.length - 1)) * 304},${120 - Math.max(0, r.margin) * 220}`,
                )
                .join(" ")}
            />
            <polyline
              fill="none"
              stroke="var(--color-chart-amber)"
              strokeWidth={2}
              points={rows
                .map(
                  (r, i) =>
                    `${8 + (i / Math.max(1, rows.length - 1)) * 304},${120 - Math.max(0, r.cashMargin) * 220}`,
                )
                .join(" ")}
            />
            {rows.map((r, i) => {
              const last = i === rows.length - 1;
              const cx = 8 + (i / Math.max(1, rows.length - 1)) * 304;
              const cy = 120 - Math.max(0, r.cashMargin) * 220;
              return (
                <g key={r.month}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={last ? 4 : 2.5}
                    fill={last ? "var(--color-amber-hi)" : "var(--color-canvas)"}
                    stroke="var(--color-chart-amber)"
                    strokeWidth={1.6}
                  />
                  {last && (
                    <text
                      x={cx}
                      y={cy - 8}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={700}
                      fill="var(--color-amber-hi)"
                    >
                      {Math.round(r.cashMargin * 100)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="text-[11px] text-faint mt-1">
            Operating vs after-notes margin (owner's take), month by month
            {marginGoal != null
              ? ` — dashed line is your ${Math.round(marginGoal * 100)}% goal`
              : ""}
            .
          </p>
          {atGoal && marginGoal != null && (
            <p className="text-[12px] text-dim mt-1.5" data-testid="months-at-goal">
              <b className="text-ink tabular-nums">{atGoal.at} of {atGoal.of}</b> month{atGoal.of === 1 ? "" : "s"} at or above the {Math.round(marginGoal * 100)}% goal this year.
            </p>
          )}
        </Board>
      </div>

      {/* the last complete quarter — the season grid, as a plain row */}
      <Panel className="p-4" data-testid="last-quarter">
        <h3 className="ds2-label mb-3 flex justify-between flex-wrap gap-2">
          <span>Last quarter · {season.label}</span>
          <span className="normal-case tracking-normal font-normal text-faint">
            the last complete calendar quarter · {season.months} P&amp;L month{season.months === 1 ? "" : "s"} filed
          </span>
        </h3>
        {season.months === 0 && season.loads === 0 ? (
          <p className="text-xs text-faint">No filed month and no delivered load in {season.label} yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4">
            <Stat label="Net revenue" value={season.months > 0 ? money(season.netRevenue) : "—"} sub="P&L income · net of the carrier cut" />
            <Stat
              label="Operating profit"
              value={season.months > 0 ? money(season.netProfit) : "—"}
              tone={season.months > 0 ? (season.netProfit >= 0 ? "text-status-positive-text" : "text-status-negative-text") : ""}
              sub="income − COGS − expenses"
            />
            <Stat
              label="True net"
              value={season.months > 0 ? money(season.trueNet) : "—"}
              tone={season.months > 0 ? (season.trueNet >= 0 ? "text-status-positive-text" : "text-status-negative-text") : ""}
              sub={`after ${money(obligationsMonthly)} of notes a month`}
            />
            <Stat label="Loads" value={String(season.loads)} sub="delivered in the quarter" />
            <Stat label="Miles" value={Math.round(season.totalMiles).toLocaleString("en-US")} sub="odometer where logged" />
            <Stat
              label="Deadhead"
              value={season.deadheadPct != null ? `${(season.deadheadPct * 100).toFixed(1)}%` : "—"}
              tone={season.deadheadPct == null ? "" : season.deadheadPct <= DEADHEAD_TARGET ? "text-status-positive-text" : "text-status-negative-text"}
              sub={`target ${Math.round(DEADHEAD_TARGET * 100)}%`}
            />
            <Stat label="Avg rate" value={season.avgRpm != null ? `${rpm(season.avgRpm)}/mi` : "—"} sub="gross per loaded mile" />
            <Stat label="Best lane" value={season.bestLane?.lane ?? "—"} sub={season.bestLane ? `${money(season.bestLane.revenue)} gross` : undefined} wrap />
          </div>
        )}
      </Panel>

      {/* weekly earnings — the last eight pay weeks, the best week as a line */}
      <Panel className="p-4" data-testid="weekly-earnings">
        <h3 className="ds2-label mb-2 flex justify-between flex-wrap gap-2">
          <span>Weekly earnings</span>
          <span className="normal-case tracking-normal font-normal text-faint">
            last 8 pay weeks · gross earned, delivered loads ·{" "}
            <span className="text-amber-hi">— best week</span>
            {weeklyTarget != null && <> · <span className="text-dim">-- target</span></>}
          </span>
        </h3>
        {(() => {
          const H = 120;
          const max = Math.max(weeklyTarget ?? 0, bestWeek?.gross ?? 0, ...weeks.map((w) => w.earned), 1);
          const y = (v: number) => 140 - (v / max) * H;
          const colW = 620 / weeks.length;
          const bestY = bestWeek ? y(bestWeek.gross) : null;
          const targetY = weeklyTarget != null ? y(weeklyTarget) : null;
          const bestLabelClear = bestY == null || targetY == null || Math.abs(bestY - targetY) > 12;
          const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
          return (
            <svg viewBox="0 0 620 160" className="w-full">
              <line x1="0" y1="140" x2="620" y2="140" stroke="var(--color-hairline-lo)" />
              {targetY != null && (
                <>
                  <line x1="0" y1={targetY} x2="620" y2={targetY} stroke="var(--color-dim)" strokeDasharray="4 4" opacity={0.6} />
                  <text x="4" y={targetY - 3} fontSize={8.5} fill="var(--color-dim)">
                    target {money(weeklyTarget ?? 0)}{weeklyFloor != null ? ` · floor ${money(weeklyFloor)}` : ""}
                  </text>
                </>
              )}
              {bestWeek && bestY != null && (
                <>
                  <line x1="0" y1={bestY} x2="620" y2={bestY} stroke="var(--color-amber-hi)" strokeWidth={1} opacity={0.8} />
                  {bestLabelClear && (
                    <text x="616" y={bestY - 3} textAnchor="end" fontSize={8.5} fill="var(--color-amber-hi)">
                      best week {money(bestWeek.gross)} · {weekLabel(bestWeek.week)}
                    </text>
                  )}
                </>
              )}
              {weeks.map((w, i) => {
                const h = Math.max(2, (w.earned / max) * H);
                const x = i * colW + colW * 0.16;
                return (
                  <g key={w.start.toISOString()} textAnchor="middle">
                    <rect
                      x={x}
                      y={140 - h}
                      width={colW * 0.68}
                      height={h}
                      rx={3}
                      fill="var(--color-chart-amber)"
                      opacity={w.now ? 0.45 : 1}
                    />
                    <text x={i * colW + colW / 2} y={152} fontSize={8.5} fill={w.now ? "var(--color-amber-hi)" : "var(--color-faint)"}>
                      {w.now ? "this week" : dayLabel(w.start)}
                    </text>
                  </g>
                );
              })}
            </svg>
          );
        })()}
        <p className="text-[12px] text-dim mt-1.5" data-testid="weeks-sentence">
          <b className="text-ink tabular-nums">{quarter.figure}</b> {quarter.label.toLowerCase()} · {quarter.detail}
        </p>
      </Panel>

      {/* where it goes (year to date, by category) */}
      <Board className="p-4">
        <h3 className="ds2-label mb-2.5 flex justify-between">
          Where it goes · {year}
          <span className="normal-case tracking-normal font-normal text-faint">
            {money(ytdIncome)} income
          </span>
        </h3>
        {cats.length === 0 ? (
          <p className="text-xs text-faint">No categorized lines yet this year.</p>
        ) : (
          <>
            <div className="flex gap-[2px] h-7 rounded-md overflow-hidden mb-2.5 bg-canvas">
              {catProfit > 0 && (
                <div
                  className="h-full flex items-center justify-center text-[9px] font-bold text-canvas"
                  style={{
                    width: `${pctOf(catProfit)}%`,
                    background:
                      "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                  }}
                >
                  {pctOf(catProfit) >= 9 ? "profit kept" : ""}
                </div>
              )}
              {cats.map((c, i) => (
                <div
                  key={c.category}
                  className="h-full"
                  style={{ width: `${pctOf(c.amount)}%`, background: segColor(c.category, i) }}
                  title={`${c.category} ${money(c.amount)}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {cats.map((c, i) => (
                <div
                  key={c.category}
                  className="flex items-center justify-between text-[11.5px] text-dim"
                >
                  <span className="truncate flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ background: segColor(c.category, i) }}
                    />
                    {c.category}
                    {c.section === "cogs" && (
                      <span className="text-[8px] text-faint">COGS</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap font-condensed font-semibold text-ink tabular-nums">
                    {money(c.amount)} · {Math.round(pctOf(c.amount))}%
                  </span>
                </div>
              ))}
            </div>
            <Link
              to="/expenses"
              className="text-[12px] font-condensed font-semibold text-amber-hi mt-2.5 inline-block"
            >
              Full P&amp;L →
            </Link>
          </>
        )}
      </Board>
    </div>
  );
};
