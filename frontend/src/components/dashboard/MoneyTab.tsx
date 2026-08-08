import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import { useExpensePeriods } from "@/hooks/useExpensePeriods";
import { topCategoriesWithOther } from "@/lib/metrics/expenses";
import { loadRevenue } from "@/lib/metrics/loads";
import { money } from "@/lib/format";

const C = { background: "#0f1622", border: "1px solid #26304a" } as const;
const TILE = { background: "#121a27", border: "1px solid #26304a" } as const;
const CAT_COLORS = ["#c8890a", "#5fd0e0", "#a06ad0", "#5f7fd0", "#d05f8a", "#6ad0a0"];
const OTHER_COLOR = "#2a3347";
const segColor = (category: string, i: number) =>
  category === "Other" ? OTHER_COLOR : CAT_COLORS[i % CAT_COLORS.length];

const monthShort = (m: string) =>
  new Date(m.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

const Tile = ({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) => (
  <div className="rounded-xl px-3.5 py-3" style={TILE}>
    <p className="text-[9.5px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-[17px] font-bold mt-0.5 leading-tight" style={{ color }}>{value}</p>
    <p className="text-[10px] text-muted-text mt-0.5">{sub}</p>
  </div>
);

export const MoneyTab = ({ loads, marginGoal }: { loads: Load[]; marginGoal: number | null }) => {
  const { periods, categoriesYTD, loading } = useExpensePeriods();
  const year = new Date().getUTCFullYear();

  const rows = useMemo(
    () =>
      [...periods]
        .filter((p) => p.income_total != null)
        .sort((a, b) => (a.period_month < b.period_month ? -1 : 1))
        .map((p) => {
          const income = p.income_total ?? 0;
          const cost = (p.cogs_total ?? 0) + (p.expense_total ?? 0);
          return { month: p.period_month, income, cost, profit: income - cost, margin: income > 0 ? (income - cost) / income : 0 };
        }),
    [periods],
  );
  const ytd = useMemo(() => rows.filter((r) => r.month.startsWith(String(year))), [rows, year]);
  const ytdIncome = ytd.reduce((s, r) => s + r.income, 0);
  const ytdProfit = ytd.reduce((s, r) => s + r.profit, 0);
  const ytdMargin = ytdIncome > 0 ? ytdProfit / ytdIncome : null;
  const best = ytd.reduce<(typeof ytd)[number] | null>((b, r) => (!b || r.margin > b.margin ? r : b), null);

  // "Where it goes" — the year's spending by category (backend rollup), top 6 +
  // Other. Profit is derived from the same category total so the bar sums to 100%.
  const cats = useMemo(() => topCategoriesWithOther(categoriesYTD, 6), [categoriesYTD]);
  const catCost = useMemo(() => categoriesYTD.reduce((s, c) => s + c.amount, 0), [categoriesYTD]);
  const catProfit = Math.max(0, ytdIncome - catCost);
  // Widths share a denominator so profit + categories always sum to 100% — even
  // in the rare month where booked cost outruns counted income.
  const denom = Math.max(ytdIncome, catCost);
  const pctOf = (amt: number) => (denom > 0 ? (amt / denom) * 100 : 0);

  const pipeline = useMemo(
    () => loads.filter((l) => l.load_status === "delivered" && l.payment_status !== "paid").reduce((s, l) => s + loadRevenue(l), 0),
    [loads],
  );

  if (loading) return <div className="text-sm text-muted-text py-12 text-center">Loading your P&amp;L…</div>;
  if (rows.length === 0)
    return (
      <div className="text-sm text-muted-text py-12 text-center">
        No P&amp;L yet. <Link to="/expenses" className="text-status-info-text hover:underline">Add a month on the Expenses page</Link> to light this up.
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
    <div className="flex flex-col gap-3 lg:flex-1 lg:min-h-0">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-condensed text-light">The money</h2>
        <span className="text-xs text-muted-text">P&amp;L · margin · where it goes — {year} to date</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Tile label={`Income · ${year}`} value={money(ytdIncome)} sub={`${ytd.length} months · net of carrier cut`} />
        <Tile label="Operating profit" value={money(ytdProfit)} color="#4ade80" sub="income − COGS − expenses" />
        <Tile
          label="Margin"
          value={ytdMargin != null ? `${Math.round(ytdMargin * 100)}%` : "—"}
          color={ytdMargin != null && marginGoal != null ? (ytdMargin >= marginGoal ? "#4ade80" : "#f5a623") : undefined}
          sub={marginGoal != null ? `${ytdMargin != null && ytdMargin >= marginGoal ? "▲ above" : "vs"} ${Math.round(marginGoal * 100)}% goal` : "operating margin"}
        />
        <Tile label="Best month" value={best ? `${monthShort(best.month)} · ${Math.round(best.margin * 100)}%` : "—"} sub={best ? `${money(best.profit)} profit` : ""} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 lg:flex-1 lg:min-h-0">
        {/* monthly P&L */}
        <div className="rounded-xl p-3 pb-2.5 flex flex-col" style={C}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-1 flex justify-between">
            Monthly P&amp;L <span className="normal-case tracking-normal text-muted-text font-normal">income = kept + spent</span>
          </h3>
          <svg viewBox="0 0 620 168" className="w-full lg:flex-1 lg:min-h-0" preserveAspectRatio="xMidYMid meet">
            <line x1="0" y1="140" x2="620" y2="140" stroke="#1c2536" />
            {bars.map((r, i) => {
              const incH = Math.max(2, (r.income / barMax) * H);
              const proH = Math.max(0, (Math.max(0, r.profit) / barMax) * H);
              const x = x0 + i * colW + colW * 0.14;
              const w = colW * 0.72;
              const cx = x0 + i * colW + colW / 2;
              const isNow = i === bars.length - 1;
              const profitFill = r.profit < 0 ? "#8a3b3b" : isNow ? "#4ade80" : "#2f7d55";
              return (
                <g key={r.month} textAnchor="middle" fontSize={8.5}>
                  <rect x={x} y={140 - incH} width={w} height={incH} rx={4} fill="#2a3347" />
                  {r.profit > 0 && <rect x={x} y={140 - proH} width={w} height={proH} rx={4} fill={profitFill} />}
                  <text x={cx} y={152} fill={isNow ? "#f5b03a" : "#5b6577"}>{monthShort(r.month)}</text>
                  <text x={cx} y={163} fill={r.margin < 0.2 ? "#f87171" : r.margin >= 0.3 ? "#4ade80" : "#8b93a3"} fontWeight={isNow ? 700 : 400}>
                    {Math.round(r.margin * 100)}%
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex gap-3 text-[10px] text-muted-text mt-0.5">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: "#2f7d55" }} />profit kept</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px]" style={{ background: "#2a3347" }} />COGS + expenses</span>
            <span>bar = income · % = margin</span>
          </div>
        </div>

        {/* margin trend */}
        <div className="rounded-xl p-3 flex flex-col" style={C}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2">Margin trend</h3>
          <svg viewBox="0 0 320 140" className="w-full lg:flex-1 lg:min-h-0" preserveAspectRatio="xMidYMid meet">
            {marginGoal != null && (
              <>
                <line x1="8" y1={120 - marginGoal * 220} x2="312" y2={120 - marginGoal * 220} stroke="#4ade80" strokeDasharray="4 4" opacity={0.5} />
                <text x="310" y={120 - marginGoal * 220 - 3} textAnchor="end" fontSize={8.5} fill="#4ade80">{Math.round(marginGoal * 100)}% goal</text>
              </>
            )}
            <polyline
              fill="none"
              stroke="#f5b03a"
              strokeWidth={2}
              points={rows.map((r, i) => `${8 + (i / Math.max(1, rows.length - 1)) * 304},${120 - Math.max(0, r.margin) * 220}`).join(" ")}
            />
            {rows.map((r, i) => (
              <circle key={r.month} cx={8 + (i / Math.max(1, rows.length - 1)) * 304} cy={120 - Math.max(0, r.margin) * 220} r={3} fill={r.margin < 0.2 ? "#f87171" : i === rows.length - 1 ? "#4ade80" : "#f5b03a"} />
            ))}
          </svg>
          <p className="text-[11px] text-muted-text mt-1">Your operating margin, month by month{best ? ` — best was ${monthShort(best.month)} at ${Math.round(best.margin * 100)}%` : ""}.</p>
        </div>
      </div>

      {/* where it goes (year to date, by category) + pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 lg:flex-1 lg:min-h-0">
        <div className="rounded-xl p-3.5 flex flex-col" style={C}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5 flex justify-between">
            Where it goes · {year}
            <span className="normal-case tracking-normal font-normal">{money(ytdIncome)} income</span>
          </h3>
          {cats.length === 0 ? (
            <p className="text-xs text-muted-text">No categorized lines yet this year.</p>
          ) : (
            <>
              <div className="flex h-7 rounded-md overflow-hidden mb-2.5" style={{ border: "1px solid #26304a" }}>
                {catProfit > 0 && (
                  <div className="h-full flex items-center justify-center text-[9px] font-bold" style={{ width: `${pctOf(catProfit)}%`, background: "#4ade80", color: "#0d1119" }}>
                    profit
                  </div>
                )}
                {cats.map((c, i) => (
                  <div key={c.category} className="h-full" style={{ width: `${pctOf(c.amount)}%`, background: segColor(c.category, i) }} title={`${c.category} ${money(c.amount)}`} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {cats.map((c, i) => (
                  <div key={c.category} className="flex items-center justify-between text-[11.5px]">
                    <span className="truncate flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: segColor(c.category, i) }} />
                      {c.category}
                      {c.section === "cogs" && <span className="text-[8px] text-muted-text">COGS</span>}
                    </span>
                    <span className="text-muted-text whitespace-nowrap">{money(c.amount)} · {Math.round(pctOf(c.amount))}%</span>
                  </div>
                ))}
              </div>
              <Link to="/expenses" className="text-[11px] text-status-info-text hover:underline mt-2.5 inline-block">Full P&amp;L →</Link>
            </>
          )}
        </div>

        <div className="rounded-xl p-3.5 flex flex-col justify-center" style={C}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2">Settlement pipeline</h3>
          <p className="text-[26px] font-extrabold" style={{ color: "#4ade80" }}>{money(pipeline)}</p>
          <p className="text-[11px] text-muted-text mt-1">Delivered, POD in, not yet settled — landing on your upcoming weekly settlement(s). No aging: it clears every week.</p>
        </div>
      </div>
    </div>
  );
};
