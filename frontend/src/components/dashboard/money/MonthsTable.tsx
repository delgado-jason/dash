import type { MonthsRow } from "@/lib/metrics/monthsTable";
import { money } from "@/lib/format";

// The Money tab's months table — the Money tab sheet (phase C), calls 1 and 2:
// the filed months read across to their quarter subtotals and the year total,
// the after-notes margin graded against the goal on every row. The month in
// progress rides as an italic estimate row beneath the filed months; it is
// never summed into anything.

const pct1 = (m: number | null): string => (m == null ? "—" : `${(m * 100).toFixed(1)}%`);

const marginTone = (atGoal: boolean | null, m: number | null): string =>
  atGoal == null ? (m != null && m < 0 ? "text-status-negative-text" : "") : atGoal ? "text-status-positive-text" : "text-status-negative-text";

const signTone = (n: number): string => (n < 0 ? "text-status-negative-text" : "");

const CELL = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const HEAD = "px-2 pb-1.5 text-right text-[11.5px] font-semibold tracking-[.09em] uppercase text-faint border-b border-hairline";

export const MonthsTable = ({
  rows,
  goal,
  estimate,
}: {
  rows: MonthsRow[];
  goal: number | null;
  estimate: { label: string; income: number } | null; // the month in progress, from monthCoverage
}) => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse font-condensed text-[14px]" data-testid="months-table">
      <thead>
        <tr>
          <th className={`${HEAD} text-left`}>Month</th>
          <th className={HEAD}>Income</th>
          <th className={HEAD}>Operating</th>
          <th className={HEAD}>After notes</th>
          <th className={HEAD}>Margin</th>
          <th className={`${HEAD} text-center`}>Goal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          if (r.kind === "quarter") {
            const short = r.months < r.monthsWanted ? ` · ${r.months} of ${r.monthsWanted} months filed` : "";
            return (
              <tr key={r.key} className="bg-well text-dim font-semibold" data-testid="quarter-row">
                <td className={`${CELL} text-left text-faint text-[12px] tracking-[.06em] uppercase`}>{r.label}{short}</td>
                <td className={CELL}>{money(r.income)}</td>
                <td className={`${CELL} ${signTone(r.profit)}`}>{money(r.profit)}</td>
                <td className={`${CELL} ${signTone(r.trueNet)}`}>{money(r.trueNet)}</td>
                <td className={`${CELL} ${marginTone(r.atGoal, r.cashMargin)}`}>{pct1(r.cashMargin)}</td>
                <td className={CELL} />
              </tr>
            );
          }
          if (r.kind === "total") {
            return (
              <tr key={r.key} className="text-ink font-bold text-[15px] border-t border-hairline" data-testid="total-row">
                <td className={`${CELL} text-left`}>{r.label}</td>
                <td className={CELL}>{money(r.income)}</td>
                <td className={`${CELL} ${signTone(r.profit)}`}>{money(r.profit)}</td>
                <td className={`${CELL} ${signTone(r.trueNet)}`}>{money(r.trueNet)}</td>
                <td className={`${CELL} ${marginTone(r.atGoal, r.cashMargin)}`}>{pct1(r.cashMargin)}</td>
                <td className={`${CELL} text-center ${r.atGoalCount != null && r.atGoalCount > 0 ? "text-status-positive-text" : "text-faint"}`}>
                  {r.atGoalCount != null ? `${r.atGoalCount} of ${r.months}` : "—"}
                </td>
              </tr>
            );
          }
          return (
            <tr key={r.key} className="border-b border-hairline-lo text-dim" data-testid="month-row">
              <td className={`${CELL} text-left text-ink font-semibold`}>{r.label}</td>
              <td className={CELL}>{money(r.income)}</td>
              <td className={`${CELL} ${signTone(r.profit)}`}>{money(r.profit)}</td>
              <td className={`${CELL} ${signTone(r.trueNet)}`}>{money(r.trueNet)}</td>
              <td className={`${CELL} ${marginTone(r.atGoal, r.cashMargin)}`}>{pct1(r.cashMargin)}</td>
              <td className={`${CELL} text-center ${r.atGoal ? "text-status-positive-text" : "text-faint"}`}>
                {r.atGoal == null ? "" : r.atGoal ? "✓" : "—"}
              </td>
            </tr>
          );
        })}
        {estimate && (
          <tr className="border-b border-hairline-lo text-faint italic" data-testid="estimate-row">
            <td className={`${CELL} text-left`}>{estimate.label} · so far</td>
            <td className={CELL}>≈ {money(estimate.income)}</td>
            <td className={CELL}>—</td>
            <td className={CELL}>—</td>
            <td className={CELL}>—</td>
            <td className={`${CELL} text-center`}>estimate</td>
          </tr>
        )}
      </tbody>
    </table>
    {goal == null && (
      <p className="text-[12px] text-amber-hi mt-2">No margin goal is set — the Goal column grades nothing until Settings has one.</p>
    )}
  </div>
);
