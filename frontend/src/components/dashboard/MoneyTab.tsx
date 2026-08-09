import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { useExpensePeriods } from "@/hooks/useExpensePeriods";
import { topCategoriesWithOther } from "@/lib/metrics/expenses";
import { Board, BoardCell } from "@/components/ui/Board";
import { ForgedPlate } from "@/components/ui/ForgedPlate";
import { PaceMeter, paceMarker, type PaceMarker } from "@/components/ui/PaceMeter";
import { money, rpm } from "@/lib/format";

// The month's story: P&L, the two margins, where it goes, and THE NOTES —
// Money's one forged surface. Pulse chases the week; Money chases the month.
// No settlement-pipeline section: the carrier clears it weekly (BCO reality),
// so that beat lives on Pulse's Next rail as timing, not receivables.

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
  marginGoal,
  obligationsMonthly,
}: {
  loads: Load[];
  trips: Trip[];
  marginGoal: number | null;
  obligationsMonthly: number; // active, non-draw monthly notes (principal) — interest is already in the P&L
}) => {
  const { periods, categoriesYTD, loading } = useExpensePeriods();
  const now = useMemo(() => new Date(), []);
  const year = now.getUTCFullYear();

  // Two margins per month: OPERATING (income − COGS − expenses; interest lives in
  // those expense lines) and CASH / after-notes (operating minus the monthly note
  // principal — the money that actually leaves the account). No interest double-
  // count: the notes carry principal only, interest is already in the P&L.
  const rows = useMemo(
    () =>
      [...periods]
        .filter((p) => p.income_total != null)
        .sort((a, b) => (a.period_month < b.period_month ? -1 : 1))
        .map((p) => {
          const income = p.income_total ?? 0;
          const cost = (p.cogs_total ?? 0) + (p.expense_total ?? 0);
          const profit = income - cost;
          return {
            month: p.period_month,
            income,
            cost,
            profit,
            margin: income > 0 ? profit / income : 0,
            cashMargin: income > 0 ? (profit - obligationsMonthly) / income : 0,
          };
        }),
    [periods, obligationsMonthly],
  );
  const ytd = useMemo(
    () => rows.filter((r) => r.month.startsWith(String(year))),
    [rows, year],
  );
  const ytdIncome = ytd.reduce((s, r) => s + r.income, 0);
  const ytdProfit = ytd.reduce((s, r) => s + r.profit, 0);
  const ytdMargin = ytdIncome > 0 ? ytdProfit / ytdIncome : null;
  // After-notes: subtract the monthly note once per P&L month in the window.
  const ytdCashMargin =
    ytdIncome > 0 ? (ytdProfit - obligationsMonthly * ytd.length) / ytdIncome : null;
  const best = ytd.reduce<(typeof ytd)[number] | null>(
    (b, r) => (!b || r.margin > b.margin ? r : b),
    null,
  );

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
      ? (ytdIncome - ytdProfit + obligationsMonthly * ytd.length) / miles
      : null;
  const profitPerMi =
    revPerMi != null && costPerMi != null ? revPerMi - costPerMi : null;

  // THE NOTES — the month in progress, if it's on the books yet.
  const latest = rows[rows.length - 1] ?? null;
  const isCurrentMonth =
    latest != null && latest.month.slice(0, 7) === now.toISOString().slice(0, 7);
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const monthProfit = isCurrentMonth ? latest.profit : null;
  const monthIncome = isCurrentMonth ? latest.income : null;
  const projIncome =
    monthIncome != null && dayOfMonth > 0
      ? (monthIncome / dayOfMonth) * daysInMonth
      : null;
  const goalProfit =
    marginGoal != null && projIncome != null && projIncome > 0
      ? marginGoal * projIncome
      : null;
  const notesCovered = monthProfit != null && monthProfit >= obligationsMonthly;
  const coverage =
    monthProfit != null && obligationsMonthly > 0
      ? Math.min(1, Math.max(0, monthProfit / obligationsMonthly))
      : null;
  // Straight-line pace: the day cumulative profit reaches the notes.
  const coverDate = useMemo(() => {
    if (monthProfit == null || monthProfit <= 0 || notesCovered) return null;
    const daily = monthProfit / dayOfMonth;
    const day = Math.ceil(obligationsMonthly / daily);
    if (day > daysInMonth) return null;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  }, [monthProfit, notesCovered, dayOfMonth, obligationsMonthly, daysInMonth, now]);

  const meterMarkers: PaceMarker[] = [
    ...(obligationsMonthly > 0 ? [paceMarker("notes", obligationsMonthly)] : []),
    ...(goalProfit != null ? [paceMarker("goal", Math.round(goalProfit))] : []),
  ];
  const meterTarget =
    goalProfit ?? Math.max(obligationsMonthly * 1.5, monthProfit ?? 0, 1);

  // Months at-or-above the goal, counted back from the latest month.
  const goalStreak = useMemo(() => {
    if (marginGoal == null) return 0;
    let n = 0;
    for (let i = ytd.length - 1; i >= 0; i--) {
      if (ytd[i].cashMargin >= marginGoal) n += 1;
      else break;
    }
    return n;
  }, [ytd, marginGoal]);

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
          sub={`${ytd.length} month${ytd.length === 1 ? "" : "s"} · net of carrier cut`}
          to="/recap"
          go="recap"
        />
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Operating profit"
          value={money(ytdProfit)}
          valueClassName={ytdProfit >= 0 ? "text-status-positive-text" : "text-status-negative-text"}
          sub="income − COGS − expenses"
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

      {/* THE NOTES — Money's one forged surface: the month's chase */}
      <ForgedPlate chamfer tilt className="p-5">
        {isCurrentMonth && monthProfit != null ? (
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
            <div>
              <p className="ds2-label">
                {monthLong(latest.month)} — covering the notes
              </p>
              <p className="font-display text-[34px] tracking-[.02em] leading-none mt-1.5 tabular-nums">
                {money(monthProfit)}{" "}
                <span className="text-[15px] text-dim font-condensed tracking-normal">
                  profit so far
                </span>
              </p>
              <PaceMeter
                filled={Math.max(0, monthProfit)}
                target={meterTarget}
                markers={meterMarkers}
              />
              <p className="text-[11.5px] text-faint mt-1.5">
                {notesCovered ? (
                  <>
                    Notes <b className="text-status-positive-text">covered</b> —
                    every dollar now rides for the goal
                    {goalProfit != null && monthProfit >= goalProfit
                      ? ", and you're past it into overdrive"
                      : ""}
                    .
                  </>
                ) : coverage != null ? (
                  <>
                    Truck &amp; trailer notes{" "}
                    <b className="text-ink">{Math.round(coverage * 100)}% covered</b>
                    {coverDate ? (
                      <>
                        {" "}
                        · on pace to cover them <b className="text-ink">
                          {fmtDay(coverDate)}
                        </b>
                      </>
                    ) : null}{" "}
                    — after that every dollar rides for the goal.
                  </>
                ) : (
                  "No notes configured — every dollar rides for the goal."
                )}
              </p>
              {best && (
                <span className="inline-flex items-center gap-2 mt-3.5 px-3 py-[7px] rounded-lg bg-well" style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.55)" }}>
                  <span className="font-forge font-semibold text-[11px] tracking-[.14em] text-amber-hi">
                    BEST MONTH
                  </span>
                  <span className="font-condensed font-semibold text-[12.5px] text-ink tabular-nums">
                    {monthShort(best.month).toUpperCase()} ·{" "}
                    {Math.round(best.margin * 100)}% · {money(best.profit)}
                  </span>
                </span>
              )}
            </div>
            <div className="md:border-l md:border-white/10 md:pl-6 flex flex-col justify-center gap-3.5">
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
              {notesCovered ? (
                <span
                  className="inline-block self-start px-3.5 py-1.5 rounded-lg font-forge font-bold text-[16px] tracking-[.14em] text-status-positive-text border-2 border-status-positive-text -rotate-3"
                  style={{ boxShadow: "inset 0 0 12px rgba(74,222,128,.15)" }}
                >
                  NOTES COVERED
                </span>
              ) : (
                <div>
                  <p className="ds2-label">The win moment</p>
                  <span className="inline-block mt-1 px-3.5 py-1 rounded-lg font-forge font-bold text-[14px] tracking-[.14em] text-ink/20 border-2 border-dashed border-white/15 -rotate-3">
                    NOTES COVERED
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="ds2-label">
              {now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })}{" "}
              — covering the notes
            </p>
            <p className="text-sm text-dim mt-2">
              This month isn't on the books yet — the notes tracker lights up once
              the month exists on Expenses.
            </p>
            <Link
              to="/expenses"
              className="inline-block mt-3 text-[13px] font-condensed font-semibold text-amber-hi"
            >
              Add the month on Expenses →
            </Link>
            {best && (
              <span className="ml-4 inline-flex items-center gap-2 px-3 py-[7px] rounded-lg bg-well" style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.55)" }}>
                <span className="font-forge font-semibold text-[11px] tracking-[.14em] text-amber-hi">
                  BEST MONTH
                </span>
                <span className="font-condensed font-semibold text-[12.5px] text-ink tabular-nums">
                  {monthShort(best.month).toUpperCase()} ·{" "}
                  {Math.round(best.margin * 100)}% · {money(best.profit)}
                </span>
              </span>
            )}
          </div>
        )}
      </ForgedPlate>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
        {/* monthly P&L */}
        <Board className="p-4">
          <h3 className="ds2-label mb-1 flex justify-between">
            Monthly P&amp;L
            <span className="normal-case tracking-normal font-normal text-faint">
              <span style={{ color: "var(--color-plate-a)" }}>■</span> income{" "}
              <span className="text-chart-amber">■</span> profit kept · margin % below
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
                    fill={
                      r.margin < 0.2
                        ? "var(--color-status-negative-text)"
                        : r.margin >= 0.3
                          ? "var(--color-status-positive-text)"
                          : "var(--color-dim)"
                    }
                    fontWeight={isNow ? 700 : 400}
                  >
                    {Math.round(r.margin * 100)}%
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
              {goalStreak >= 2 && (
                <span className="font-forge font-semibold text-[11px] tracking-[.12em] text-amber-hi">
                  {goalStreak} MO ≥ GOAL
                </span>
              )}
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
        </Board>
      </div>

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
