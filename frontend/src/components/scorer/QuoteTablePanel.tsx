import type { QuoteTable } from "@/lib/metrics/quoteTable";
import type { PassThroughCost } from "@/lib/metrics/passThrough";
import { money, rpm as fmtRpm } from "@/lib/format";

// WHAT TO QUOTE — the whole ladder in dollars for THIS load, on every result.
// (The Score a Load sheet, Call 2 and Call 7.2: "a verdict tells you whether
// to book; it does not tell you what to counter with", and "show the
// breakdown, always".) Each quote already contains the grossed-up permits and
// escorts, because the figure in the column is the number you say out loud —
// not a base to do arithmetic on while the agent waits. The rung the offer
// cleared carries the arrow; above target the column says what it clears by.
const gapWords = (gap: number | null): { text: string; cls: string } => {
  if (gap == null) return { text: "—", cls: "text-faint" };
  const d = `$${Math.round(Math.abs(gap)).toLocaleString("en-US")}`;
  return gap >= -0.5
    ? { text: `clears by ${d}`, cls: "text-status-positive-text" }
    : { text: `ask ${d} more`, cls: "text-status-negative-text" };
};

const th = "font-semibold pb-1.5 border-b border-hairline";

export const QuoteTablePanel = ({
  table,
  offer,
  drivenMiles,
  ptCost,
  ptAsk,
  ptPremium,
}: {
  table: QuoteTable;
  offer: number | null;
  drivenMiles: number;
  ptCost: PassThroughCost;
  ptAsk: number; // what the load must carry for the pass-throughs — cost ÷ take
  ptPremium: number | null; // the gross-up alone: ask − cost
}) => {
  const minimum = table.rows.find((r) => r.rung === "minimum");
  const grossedUp = ptAsk > 0 && ptPremium != null && ptPremium > 0;
  return (
    <div className="ds2-board p-4" data-testid="quote-table">
      <p className="ds2-label">
        What to quote
        {ptAsk > 0 && (
          <span className="normal-case tracking-normal font-normal text-faint"> — permits and escorts included</span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full mt-2 text-[13px] font-condensed">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
              <th className={`text-left ${th}`}>Rung</th>
              <th className={`text-right ${th}`}>Margin</th>
              <th className={`text-right ${th}`}>$/driven mi</th>
              <th className={`text-right ${th}`}>Quote</th>
              <th className={`text-left pl-4 ${th}`}>{offer != null ? `vs ${money(offer)}` : "vs the offer"}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => {
              const hi = table.cleared?.rung === r.rung;
              const g = gapWords(r.gap);
              return (
                <tr
                  key={r.rung}
                  className={`border-b ds2-cell-rule last:border-b-0 ${hi ? "text-ink font-semibold" : "text-dim"}`}
                  data-rung={r.rung}
                  data-cleared={hi || undefined}
                >
                  <td className="py-[7px]">{r.label}</td>
                  <td className="py-[7px] text-right tabular-nums">
                    {r.markup > 0 ? `${Math.round(r.margin * 100)}%` : <span className="text-faint">0%</span>}
                  </td>
                  <td className="py-[7px] text-right tabular-nums">{fmtRpm(r.rpm)}</td>
                  <td className="py-[7px] text-right tabular-nums text-ink">{money(r.quote)}</td>
                  <td className={`py-[7px] pl-4 whitespace-nowrap ${g.cls}`}>
                    {g.text}
                    {hi ? " ←" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="font-condensed text-[12px] text-faint mt-2.5 leading-snug">
        Each quote = the rung on {drivenMiles.toLocaleString("en-US")} driven mi
        {ptAsk > 0 && (
          <>
            {" "}
            + {money(ptCost.total)} of permits and escorts
            {grossedUp && (
              <>
                {" "}
                grossed up by {money(ptPremium as number)}, because the deduction is paid back at your
                linehaul split, not at 100%
              </>
            )}
          </>
        )}
        .
      </p>
      {grossedUp && minimum && (
        <p className="font-condensed text-[12px] mt-1 leading-snug text-amber-hi">
          Billed as a 100% line, minimum would ask {money(minimum.quote - (ptPremium as number))} instead of{" "}
          {money(minimum.quote)}.
        </p>
      )}
    </div>
  );
};
