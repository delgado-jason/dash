import { useMemo } from "react";
import { MARGIN_GOAL } from "@/lib/constants/targets";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { useExpensePeriods } from "@/hooks/useExpensePeriods";
import { useLocalToday } from "@/hooks/useLocalToday";
import { topCategoriesWithOther } from "@/lib/metrics/expenses";
import { Board } from "@/components/ui/Board";
import { Panel } from "@/components/ui/Panel";
import { MonthsTable } from "./money/MonthsTable";
import { monthCoverage } from "@/lib/metrics/monthCoverage";
import { profitRows, ytdRows, ytdSummary, monthsAtGoal, lastFiledMonth, monthIsFiled } from "@/lib/metrics/profitSummary";
import { monthsTable } from "@/lib/metrics/monthsTable";
import { bestPayWeek, weekLabel } from "@/lib/metrics/payWeeks";
import { quarterWeekVerdicts } from "@/lib/metrics/grind";
import { getWeekGrossEarned, payWeekRange, type RateTargets } from "@/lib/metrics/rateTargets";
import { PAY_WEEK_START_DOW } from "@/lib/constants/targets";
import { isDelivered } from "@/lib/metrics/status";
import { weeksWords } from "./weeksWords";
import { money, rpm } from "@/lib/format";

// The Money tab answers "am I profitable, and is it trending the right way?" at
// the grains Pulse cannot: by month, by quarter, by week, and by where the
// money went (the Money tab sheet, phase C, Nov 8 — all six calls nodded).
// Pulse carries the headline (true net this year, the last filed month, this
// pay week); this tab keeps the series and the breakdown, in reading order:
// the month in progress, the months, the two trends, the weeks, where it goes.
// No settlement-pipeline section: the carrier clears it weekly (BCO reality),
// so that beat lives on Pulse as the next deposit, not receivables.

const WEEK_MS = 7 * 86400000;

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
const monthLong = (m: string) =>
  new Date(m.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
// A day on the calendar, UTC — the month's cover day.
const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
// A moment (the row's created_at) read in the operator's own day.
const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const MoneyTab = ({
  loads,
  trips,
  targets,
  marginGoal,
  obligationsMonthly,
}: {
  loads: Load[];
  trips: Trip[];
  targets: RateTargets; // the one basis — the weekly target and floor, the pay week, the rate to book
  marginGoal: number | null;
  obligationsMonthly: number; // active, non-draw monthly notes not on the P&L (principal) — interest is already in the P&L
}) => {
  const { periods, categoriesYTD, loading } = useExpensePeriods();
  // The operator's local day, anchored, rolling at midnight (call 13).
  const now = useLocalToday();
  const year = now.getUTCFullYear();
  const todayKey = now.toISOString().slice(0, 10);

  // The P&L arithmetic lives in lib/metrics/profitSummary.ts — one truth with
  // Pulse's "Profit · year to date" card (Cockpit PR 1).
  const rows = useMemo(() => profitRows(periods, obligationsMonthly), [periods, obligationsMonthly]);
  const ytd = useMemo(() => ytdRows(rows, year), [rows, year]);
  const summary = useMemo(() => ytdSummary(rows, year), [rows, year]);
  const ytdIncome = summary.income;

  // THE MONTHS — every filed month, the closed quarters, the year (calls 1, 2).
  const table = useMemo(() => monthsTable(rows, year, marginGoal, now), [rows, year, marginGoal, now]);
  const atGoal = useMemo(() => monthsAtGoal(ytd, marginGoal), [ytd, marginGoal]);

  // The latest filed month and the day it was filed (the filing line, call 5).
  const last = useMemo(() => lastFiledMonth(rows), [rows]);
  const lastFiledAt = useMemo(
    () => (last ? (periods.find((p) => p.period_month === last.month)?.filed_at ?? null) : null),
    [periods, last],
  );
  const currentFiled = monthIsFiled(rows, todayKey);

  // THE MONTH IN PROGRESS (Jason, 2026-08-10: "one load will cover my notes" —
  // the real metric is the monthly expense threshold and the margin over it).
  // Income from delivered loads at net races the MEAN monthly cost of the
  // basis window; the notes ride inside the threshold. One line, with its
  // caveat (call 3).
  const cov = useMemo(
    () => monthCoverage(periods, obligationsMonthly, loads, now, trips),
    [periods, obligationsMonthly, loads, now, trips],
  );
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const coverDate =
    cov.coverDay != null && cov.coverDay <= daysInMonth
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), cov.coverDay))
      : null;
  const monthKey = todayKey.slice(0, 7);
  const deliveredThisMonth = useMemo(
    () => loads.filter((l) => isDelivered(l) && l.delivery_date?.startsWith(monthKey)).length,
    [loads, monthKey],
  );
  const estimate = cov.estimated && cov.income > 0 ? { label: cov.monthLabel, income: cov.income } : null;

  // Realized per-mile economics — the year's net income and all-in cost (P&L
  // cost + note principal) spread over odometer-true miles from loads and
  // trips. A caption, named for its basis (call 4): this is NOT the gross
  // rate to book, which the Expenses and Market pages price per driven mile.
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
    return { fromLoads, fromTrips, total: fromLoads + fromTrips };
  }, [loads, trips, year]);
  const deliveredYtd = useMemo(
    () => loads.filter((l) => isDelivered(l) && l.delivery_date?.startsWith(String(year))).length,
    [loads, year],
  );
  const revPerMi = miles.total > 0 && ytdIncome > 0 ? ytdIncome / miles.total : null;
  const costPerMi = miles.total > 0 && ytdIncome > 0 ? (ytdIncome - summary.trueNet) / miles.total : null;
  const profitPerMi = revPerMi != null && costPerMi != null ? revPerMi - costPerMi : null;
  const rateToBook = targets.bookingLadder?.target ?? null;

  // The last eight pay weeks (Wednesday → Tuesday), gross earned — delivered
  // freight only — anchored on the basis's own pay week; and the best completed
  // pay week ever as a plain line.
  const weekAnchor = targets.weekStart ?? payWeekRange(now, PAY_WEEK_START_DOW).start;
  const weeks = useMemo(() => {
    const out: { start: Date; earned: number; now: boolean }[] = [];
    for (let i = 7; i >= 0; i--) {
      const s = new Date(weekAnchor.getTime() - i * WEEK_MS);
      out.push({ start: s, earned: getWeekGrossEarned(loads, s, new Date(s.getTime() + WEEK_MS)), now: i === 0 });
    }
    return out;
  }, [loads, weekAnchor]);
  const bestWeek = useMemo(() => bestPayWeek(loads, todayKey), [loads, todayKey]);
  const quarter = useMemo(
    () => weeksWords(quarterWeekVerdicts(loads, targets.gross, now)),
    [loads, targets.gross, now],
  );
  const weeklyTarget = targets.gross?.weeklyTarget ?? null;
  const weeklyFloor = targets.gross?.weeklyBreakEven ?? null;

  // "Where it goes" — the year's spending by category (backend rollup), top 6 +
  // Other. Profit is derived from the same category total so the bar sums to 100%.
  const cats = useMemo(() => topCategoriesWithOther(categoriesYTD, 6), [categoriesYTD]);
  const catCost = useMemo(() => categoriesYTD.reduce((s, c) => s + c.amount, 0), [categoriesYTD]);
  const catProfit = Math.max(0, ytdIncome - catCost);
  // Widths share a denominator so profit + categories always sum to 100% — even
  // in the rare month where booked cost outruns counted income.
  const denom = Math.max(ytdIncome, catCost);
  const pctOf = (amt: number) => (denom > 0 ? (amt / denom) * 100 : 0);

  if (loading)
    return <div className="text-sm text-dim py-12 text-center">Loading your P&amp;L…</div>;
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

  // The monthly bars — the year's filed months (the table's grain).
  const bars = ytd.length > 0 ? ytd : rows.slice(-8);
  const barMax = Math.max(...bars.map((r) => r.income), 1);
  const H = 128;
  // Cap the column width so a 1–2 month view doesn't render giant bars; center
  // the group when there are fewer than a full year of months.
  const colW = Math.min(96, 620 / bars.length);
  const x0 = (620 - colW * bars.length) / 2;
  const goalPct = Math.round((marginGoal ?? MARGIN_GOAL) * 100);
  const coverPct = cov.threshold != null && cov.threshold > 0 ? Math.min(100, Math.max(0, (cov.income / cov.threshold) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* A · the month in progress — one line with a thin bar — and the filing line */}
      <Panel className="p-4" data-testid="month-now">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-center">
          <div className="min-w-0">
            <p className="ds2-label">
              {cov.monthLabel} · {cov.estimated ? "so far · estimated from delivered loads at net" : "filed"}
            </p>
            <p className="font-condensed font-semibold text-[26px] leading-none mt-1.5 tabular-nums">
              {cov.estimated ? "≈ " : ""}
              {money(cov.income)}{" "}
              <span className="text-[13px] text-dim font-normal">
                income{cov.estimated ? " so far" : ""} · {plural(deliveredThisMonth, "load")} delivered
              </span>
            </p>
            {cov.threshold != null ? (
              <>
                <div className="relative mt-5 h-1.5 rounded-full bg-well border border-hairline-lo">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${coverPct}%` }} />
                  <span className="absolute right-0 -top-4 ds2-label" style={{ fontSize: 9.5 }}>
                    month {money(cov.threshold)}
                  </span>
                </div>
                <p className="text-[12px] text-dim mt-2" data-testid="month-line">
                  {cov.covered ? (
                    <>
                      Month <b className="text-status-positive-text">covered</b> —{" "}
                      <b className="text-status-positive-text">{money(cov.marginOver ?? 0)}</b> over the{" "}
                      {money(cov.threshold)} month{cov.windowLabel ? ` (the ${cov.windowLabel} mean of cost plus notes)` : ""} —
                      past it, every dollar is margin.
                    </>
                  ) : (
                    <>
                      <b className="text-ink">{money(cov.short ?? 0)} short</b> of the {money(cov.threshold)} month
                      {cov.windowLabel ? ` (the ${cov.windowLabel} mean of cost plus notes)` : ""} · {plural(daysLeft, "day")} left ·{" "}
                      {coverDate ? (
                        <>on pace to cover it <b className="text-ink">{fmtDay(coverDate)}</b></>
                      ) : (
                        "not on pace to cover it this month"
                      )}{" "}
                      — past the threshold, every dollar is margin.
                    </>
                  )}
                  {cov.estimated ? " The real P&L takes over when the month posts." : ""}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-dim mt-2">
                The threshold comes from your P&amp;L —{" "}
                <Link to="/expenses" className="text-amber-hi hover:text-hot">post a month of expenses</Link> and this
                line reads against your mean monthly cost.
              </p>
            )}
          </div>
          <div className="md:border-l md:border-hairline md:pl-5" data-testid="filing-line">
            <p className="ds2-label">Filed</p>
            {last ? (
              <>
                <p className="font-condensed font-semibold text-[20px] leading-none mt-1.5">
                  {monthLong(last.month)}{" "}
                  {lastFiledAt && (
                    <span className="text-[12px] text-dim font-normal">filed {fmtStamp(lastFiledAt)}</span>
                  )}
                </p>
                <p className="text-[11.5px] text-faint mt-1.5">
                  operating{" "}
                  <b className={`tabular-nums ${last.profit < 0 ? "text-status-negative-text" : "text-ink"}`}>{money(last.profit)}</b> · after notes{" "}
                  <b className={`tabular-nums ${last.profit - obligationsMonthly < 0 ? "text-status-negative-text" : "text-ink"}`}>
                    {money(last.profit - obligationsMonthly)}
                  </b>
                  {last.month.startsWith(String(year)) ? ` · the ${ordinal(ytd.length)} month of ${year}` : ""}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-dim mt-1.5">No month filed yet.</p>
            )}
            {!currentFiled && (
              <p className="text-[11.5px] mt-2">
                <Link to="/expenses" className="text-amber-hi hover:text-hot">
                  {cov.monthLabel} posts when you file it · Expenses ›
                </Link>
              </p>
            )}
          </div>
        </div>
      </Panel>

      {/* B · the months — the filed months, the closed quarters, the year */}
      <Panel className="p-4" data-testid="months">
        <h3 className="ds2-label mb-2 flex justify-between flex-wrap gap-2">
          <span>The months · {year}</span>
          <span className="normal-case tracking-normal font-normal text-faint">
            income net of the carrier cut · after notes = operating − {money(obligationsMonthly)} of notes a month
            {marginGoal != null ? ` · margin after notes graded against your ${goalPct}% goal` : ""}
          </span>
        </h3>
        <MonthsTable rows={table} goal={marginGoal} estimate={estimate} />
        <p className="text-[11.5px] text-faint mt-3" data-testid="realized-line">
          Realized per odometer mile · {year} ·{" "}
          {revPerMi != null && costPerMi != null && profitPerMi != null ? (
            <>
              income <b className="text-ink tabular-nums">{rpm(revPerMi)}</b> · all-in{" "}
              <b className="text-ink tabular-nums">{rpm(costPerMi)}</b> · kept{" "}
              <b className={`tabular-nums ${profitPerMi >= 0 ? "text-status-positive-text" : "text-status-negative-text"}`}>{rpm(profitPerMi)}</b> ·{" "}
              {Math.round(miles.total).toLocaleString("en-US")} miles ({Math.round(miles.fromLoads).toLocaleString("en-US")} under loads,{" "}
              {Math.round(miles.fromTrips).toLocaleString("en-US")} on trips) · {plural(deliveredYtd, "delivered load")}.
            </>
          ) : (
            <>needs odometer readings on this year's loads and trips.</>
          )}{" "}
          The net P&amp;L over the miles you drove — not the gross rate to book
          {rateToBook != null ? `, which is ${rpm(rateToBook)} per driven mile` : ""} on Expenses and Market.
        </p>
      </Panel>

      {/* C · the two trends */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
        {/* monthly P&L */}
        <Board className="p-4">
          <h3 className="ds2-label mb-1 flex justify-between">
            Monthly P&amp;L · {year}
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
                  <rect x={x} y={140 - incH} width={w} height={incH} rx={4} fill="var(--color-plate-a)" />
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
                    // The margin AFTER NOTES, graded against the one goal: red
                    // under it, green at goal +5pts (strong), dim between.
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
                <text x="310" y={120 - marginGoal * 220 - 3} textAnchor="end" fontSize={8.5} fill="var(--color-status-positive-text)">
                  {Math.round(marginGoal * 100)}% goal
                </text>
              </>
            )}
            <polyline
              fill="none"
              stroke="var(--color-chart-blue)"
              strokeWidth={2}
              points={rows
                .map((r, i) => `${8 + (i / Math.max(1, rows.length - 1)) * 304},${120 - Math.max(0, r.margin) * 220}`)
                .join(" ")}
            />
            <polyline
              fill="none"
              stroke="var(--color-chart-amber)"
              strokeWidth={2}
              points={rows
                .map((r, i) => `${8 + (i / Math.max(1, rows.length - 1)) * 304},${120 - Math.max(0, r.cashMargin) * 220}`)
                .join(" ")}
            />
            {rows.map((r, i) => {
              const isLast = i === rows.length - 1;
              const cx = 8 + (i / Math.max(1, rows.length - 1)) * 304;
              const cy = 120 - Math.max(0, r.cashMargin) * 220;
              return (
                <g key={r.month}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isLast ? 4 : 2.5}
                    fill={isLast ? "var(--color-amber-hi)" : "var(--color-canvas)"}
                    stroke="var(--color-chart-amber)"
                    strokeWidth={1.6}
                  />
                  {isLast && (
                    <text x={cx} y={cy - 8} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--color-amber-hi)">
                      {Math.round(r.cashMargin * 100)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="text-[11px] text-faint mt-1">
            Operating vs after-notes margin (owner's take), month by month
            {marginGoal != null ? ` — dashed line is your ${Math.round(marginGoal * 100)}% goal` : ""}. Losing months sit on the floor.
          </p>
          {atGoal && marginGoal != null && (
            <p className="text-[12px] text-dim mt-1.5" data-testid="months-at-goal">
              <b className="text-ink tabular-nums">{atGoal.at} of {atGoal.of}</b> month{atGoal.of === 1 ? "" : "s"} at or above the {Math.round(marginGoal * 100)}% goal this year.
            </p>
          )}
        </Board>
      </div>

      {/* D · weekly earnings — the last eight pay weeks, the best week as a line */}
      <Panel className="p-4" data-testid="weekly-earnings">
        <h3 className="ds2-label mb-2 flex justify-between flex-wrap gap-2">
          <span>Weekly earnings</span>
          <span className="normal-case tracking-normal font-normal text-faint">
            last 8 pay weeks · gross earned, delivered loads ·{" "}
            <span className="text-amber-hi">— best week</span>
            {weeklyTarget != null && <> · <span className="text-dim">-- target · floor</span></>}
          </span>
        </h3>
        {(() => {
          const HH = 120;
          const max = Math.max(weeklyTarget ?? 0, bestWeek?.gross ?? 0, ...weeks.map((w) => w.earned), 1);
          const y = (v: number) => 140 - (v / max) * HH;
          const cw = 620 / weeks.length;
          const bestY = bestWeek ? y(bestWeek.gross) : null;
          const targetY = weeklyTarget != null ? y(weeklyTarget) : null;
          const floorY = weeklyFloor != null ? y(weeklyFloor) : null;
          const bestLabelClear = bestY == null || targetY == null || Math.abs(bestY - targetY) > 12;
          const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
          return (
            <svg viewBox="0 0 620 160" className="w-full">
              <line x1="0" y1="140" x2="620" y2="140" stroke="var(--color-hairline-lo)" />
              {targetY != null && (
                <>
                  <line x1="0" y1={targetY} x2="620" y2={targetY} stroke="var(--color-dim)" strokeDasharray="4 4" opacity={0.6} />
                  <text x="4" y={targetY - 3} fontSize={8.5} fill="var(--color-dim)">
                    target {money(weeklyTarget ?? 0)}
                  </text>
                </>
              )}
              {floorY != null && (
                <>
                  <line x1="0" y1={floorY} x2="620" y2={floorY} stroke="var(--color-faint)" strokeDasharray="2 4" opacity={0.6} />
                  {(targetY == null || Math.abs(floorY - targetY) > 12) && (
                    <text x="4" y={floorY + 10} fontSize={8.5} fill="var(--color-faint)">
                      floor {money(weeklyFloor ?? 0)}
                    </text>
                  )}
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
                const h = Math.max(2, (w.earned / max) * HH);
                const x = i * cw + cw * 0.16;
                return (
                  <g key={w.start.toISOString()} textAnchor="middle">
                    <rect x={x} y={140 - h} width={cw * 0.68} height={h} rx={3} fill="var(--color-chart-amber)" opacity={w.now ? 0.45 : 1} />
                    <text x={i * cw + cw / 2} y={152} fontSize={8.5} fill={w.now ? "var(--color-amber-hi)" : "var(--color-faint)"}>
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

      {/* E · where it goes (year to date, by category) */}
      <Board className="p-4">
        <h3 className="ds2-label mb-2.5 flex justify-between">
          Where it goes · {year}
          <span className="normal-case tracking-normal font-normal text-faint">{money(ytdIncome)} income · share of income</span>
        </h3>
        {cats.length === 0 ? (
          <p className="text-xs text-faint">No categorized lines yet this year.</p>
        ) : (
          <>
            <div className="flex gap-[2px] h-7 rounded-md overflow-hidden mb-2.5 bg-canvas">
              {catProfit > 0 && (
                <div
                  className="h-full flex items-center justify-center text-[9px] font-bold text-on-amber"
                  style={{ width: `${pctOf(catProfit)}%`, background: "var(--color-amber)" }}
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
                <div key={c.category} className="flex items-center justify-between text-[11.5px] text-dim">
                  <span className="truncate flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ background: segColor(c.category, i) }} />
                    {c.category}
                    {c.section === "cogs" && <span className="text-[8px] text-faint">COGS</span>}
                  </span>
                  <span className="whitespace-nowrap font-condensed font-semibold text-ink tabular-nums">
                    {money(c.amount)} · {Math.round(pctOf(c.amount))}%
                  </span>
                </div>
              ))}
            </div>
            <Link to="/expenses" className="text-[12px] font-condensed font-semibold text-amber-hi mt-2.5 inline-block">
              Full P&amp;L →
            </Link>
          </>
        )}
      </Board>
    </div>
  );
};
