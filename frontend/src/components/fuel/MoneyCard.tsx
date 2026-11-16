import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { FuelVsRevenue, FuelMonth } from "@/lib/metrics/fuelRevenue";
import { coverageWord } from "@/lib/metrics/fuelRevenue";
import { fscParWords } from "@/lib/metrics/fscTable";
import { money } from "@/lib/format";
import { PartHeader } from "./PartHeader";
import { GRADE_CLASS, monthLong, monthShort, pct0 } from "./format";

// Part 01 — THE MONEY. Is the surcharge paying for the fuel: the last complete
// month's sentence, the running month as "so far", the coverage-against-par
// chart (Jason, 2026-11-15: "I do like the line charts to represent time or a
// period over time") and the six-month table. The engine and the par rule are
// untouched (fuelRevenue.ts) — this card only says what they read.
const Cell = ({ label, big, lines }: { label: string; big: React.ReactNode; lines: React.ReactNode[] }) => (
  <div className="px-4 py-3">
    <p className="font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint">{label}</p>
    <p className="font-condensed font-semibold text-[26px] leading-tight tabular-nums mt-0.5">{big}</p>
    {lines.map((l, i) => (
      <p key={i} className="font-condensed text-[13px] text-dim mt-0.5 leading-snug">
        {l}
      </p>
    ))}
  </div>
);

const CoverageChart = ({ rows, parUnavailable }: { rows: FuelMonth[]; parUnavailable: boolean }) => {
  const data = rows.map((m) => ({
    label: monthShort(m.month),
    covered: m.fscCoverage == null ? null : Math.round(m.fscCoverage * 100),
    par: parUnavailable || m.expectedCoverage == null ? null : Math.round(m.expectedCoverage * 100),
  }));
  if (data.length < 2) return null;
  const name = (k: string) => (k === "covered" ? "covered" : "par");
  return (
    <div className="px-4 pt-3">
      <p className="font-condensed text-[12px] text-faint mb-1">surcharge coverage by month · what you collected against what the schedule owed</p>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline-lo)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--color-faint)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--color-hairline)" }} />
          <YAxis
            stroke="var(--color-faint)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={[0, "auto"]}
            tickFormatter={(v) => `${v}%`}
            width={38}
          />
          <Tooltip
            contentStyle={{ background: "var(--color-iron)", border: "1px solid var(--color-hairline)", borderRadius: 8, color: "var(--color-ink)", fontSize: 12 }}
            formatter={(v, k) => [v == null ? "—" : `${v}%`, name(String(k))]}
          />
          <Legend formatter={(v) => name(String(v))} wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="par" stroke="var(--color-chart-blue)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} connectNulls={false} />
          <Line type="monotone" dataKey="covered" stroke="var(--color-amber-hi)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--color-amber)" }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MoneyCard = ({ data, parUnavailable = false, now }: { data: FuelVsRevenue; parUnavailable?: boolean; now: Date }) => {
  const m = data.headline;
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!m) {
    return (
      <div className="ds2-board overflow-hidden mt-4">
        <PartHeader n="01" title="THE MONEY" sub="is the surcharge paying for the fuel" />
        <p className="font-condensed text-[14px] text-faint px-4 py-3">No month with logged fuel yet — the surcharge reads against the fuel once a fill is on the log.</p>
      </div>
    );
  }
  const headlineIsRunning = m.month === cur;
  const read = coverageWord(m, parUnavailable);
  const sf = data.soFar;
  // The table: the last six COMPLETE months with logged fuel, newest first.
  // The running month is the third cell, not a row — a partial month is not graded.
  const complete = data.months.filter((x) => x.month < cur).slice(-6);
  const tableRows = [...complete].reverse();

  return (
    <div className="ds2-board overflow-hidden mt-4">
      <PartHeader
        n="01"
        title="THE MONEY"
        sub={
          <>
            is the surcharge paying for the fuel · {monthLong(m.month)}, {headlineIsRunning ? "the month so far — no complete month with fuel yet" : "the last complete month"}
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[color:var(--color-hairline-lo)]">
        <Cell
          label="Surcharge covers"
          big={
            m.fscCoverage == null ? (
              "—"
            ) : (
              <>
                <span className={GRADE_CLASS[read.grade]}>{pct0(m.fscCoverage)}</span>
                {!parUnavailable && m.expectedCoverage != null && (
                  <span className="text-[15px] font-normal text-dim"> against a par near {pct0(m.expectedCoverage)}</span>
                )}
              </>
            )
          }
          lines={[
            <>
              {money(m.fsc)} FSC against {money(m.fuelSpend)} of fuel · <span className={GRADE_CLASS[read.grade]}>{read.word}</span>
            </>,
            <span className={parUnavailable ? "text-amber-hi" : "text-faint"}>
              {parUnavailable ? "par unavailable — couldn't load the surcharge tables or the weekly scale" : `· ${fscParWords(m.par)}`}
            </span>,
          ]}
        />
        <Cell
          label={`Fuel · ${monthLong(m.month)}`}
          big={money(m.fuelSpend)}
          lines={[
            <>
              {Math.round(m.gallons).toLocaleString("en-US")} gal{m.ppg != null ? ` · $${m.ppg.toFixed(2)}/gal` : ""} · {m.fills} fill{m.fills === 1 ? "" : "s"}
              {m.defSpend > 0 ? ` · ${money(m.defSpend)} DEF` : ""}
            </>,
            m.fuelPctNet != null ? <>{pct0(m.fuelPctNet)} of {money(m.net)} net</> : <>no net revenue delivered that month</>,
          ]}
        />
        {sf ? (
          <Cell
            label={`${monthLong(sf.month)} so far`}
            big={sf.fscCoverage == null ? "—" : pct0(sf.fscCoverage)}
            lines={[
              <>
                {money(sf.fsc)} FSC against {money(sf.fuelSpend)} of fuel · a partial month, not graded
              </>,
              <span className="text-faint">
                {!parUnavailable && sf.expectedCoverage != null ? `par so far near ${pct0(sf.expectedCoverage)} · ` : ""}
                {parUnavailable ? "par unavailable" : fscParWords(sf.par)}
              </span>,
            ]}
          />
        ) : (
          <Cell label={`${monthLong(cur)} so far`} big="—" lines={[headlineIsRunning ? <>this is the running month</> : <>no fill logged this month yet</>]} />
        )}
      </div>

      <div className="border-t ds2-cell-rule">
        <CoverageChart rows={complete} parUnavailable={parUnavailable} />
        {tableRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] font-condensed text-[13.5px] mt-2">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
                  <th className="text-left font-semibold px-4 py-1.5">month</th>
                  <th className="text-right font-semibold px-2 py-1.5">fuel</th>
                  <th className="text-right font-semibold px-2 py-1.5">fsc</th>
                  <th className="text-right font-semibold px-2 py-1.5">covered</th>
                  <th className="text-right font-semibold px-2 py-1.5">par</th>
                  <th className="text-left font-semibold px-4 py-1.5">read</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const w = coverageWord(r, parUnavailable);
                  return (
                    <tr key={r.month} className="border-t ds2-cell-rule text-dim" data-month={r.month}>
                      <td className="px-4 py-[6px] text-ink">{monthShort(r.month)}</td>
                      <td className="px-2 py-[6px] text-right tabular-nums">{money(r.fuelSpend)}</td>
                      <td className="px-2 py-[6px] text-right tabular-nums">{money(r.fsc)}</td>
                      <td className="px-2 py-[6px] text-right tabular-nums text-ink">{r.fscCoverage == null ? "—" : pct0(r.fscCoverage)}</td>
                      <td className="px-2 py-[6px] text-right tabular-nums">{parUnavailable || r.expectedCoverage == null ? "—" : pct0(r.expectedCoverage)}</td>
                      <td className={`px-4 py-[6px] ${GRADE_CLASS[w.grade]}`}>{w.word}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="font-condensed text-[12.5px] text-faint px-4 py-2 border-t ds2-cell-rule">
          covered = the surcharge collected ÷ the fuel bought that month · par = what Landstar's schedule owes at the month's diesel price on your loaded miles — a
          surcharge never pays the first $1.29 of a gallon or an empty mile · months with logged fuel only
        </p>
      </div>
    </div>
  );
};
