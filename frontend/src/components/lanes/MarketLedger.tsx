import { useState } from "react";
import type { LedgerRow } from "@/lib/metrics/marketLedger";
import { ledgerFolded } from "@/lib/metrics/marketLedger";
import type { MarketGrade } from "@/lib/metrics/marketFactor";
import {
  fmtPerDay,
  perDayTone,
  type DailyTargets,
} from "@/lib/metrics/perDay";
import { perDayTextClass } from "./rpmStyle";
import { rpm as fmtRpm } from "@/lib/format";

// The grade chip — the Load Scorer's own four words, worn the same on both
// halves of the row. StatusPill's shape, minus its dot: eight of these sit in
// one table row and the dots turned it into a constellation.
const GRADE_TONE: Record<MarketGrade, string> = {
  strong: "bg-status-positive-text/12 text-status-positive-text",
  fair: "bg-white/[.07] text-dim",
  soft: "bg-status-negative-text/12 text-status-negative-text",
  thin: "border border-dashed border-hairline text-faint",
};

export const GradeChip = ({ grade }: { grade: MarketGrade }) => (
  <span
    className={`inline-flex items-center h-[17px] px-[5px] rounded font-condensed font-bold text-[9.5px] tracking-[.06em] uppercase ${GRADE_TONE[grade]}`}
  >
    {grade}
  </span>
);

const num = (n: number | null, digits = 0): string =>
  n == null ? "—" : n.toFixed(digits);

interface Props {
  rows: LedgerRow[];
  // The ladder's daily break-even / target — what the $/day column is graded
  // against. null until the P&L has a cost basis: the figure still prints, it
  // just carries no verdict.
  daily: DailyTargets | null;
  selected: string | null;
  onSelect: (state: string | null) => void;
  hovered: string | null;
  onHover: (state: string | null) => void;
  grainWord: string; // "state" / "region", for the fold line
}

export const MarketLedger = ({
  rows,
  daily,
  selected,
  onSelect,
  hovered,
  onHover,
  grainWord,
}: Props) => {
  const [expanded, setExpanded] = useState(false);
  const fold = ledgerFolded(rows);
  const shown = expanded ? rows : fold.shown;
  const foldable = rows.length - fold.shown.length;

  if (rows.length === 0)
    return (
      <p className="text-dim text-sm py-6 px-4 text-center">
        No delivered loads in this window.
      </p>
    );

  // Nine columns that FIT the board: a fixed table layout with percentage
  // widths, the market names truncated, and no sideways scroll ever — the rows
  // scroll vertically inside the board instead (the page sizes the board to
  // the map). The header stays put while the rows move under it.
  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <table className="w-full table-fixed font-condensed text-[12.5px] border-collapse">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ background: "var(--color-panel)" }}>
            <tr>
              <th className="text-left" />
              <th
                colSpan={4}
                className="text-center text-[10px] font-semibold tracking-[.1em] uppercase text-amber-hi px-2 pt-1.5"
              >
                OUT · loads born here
              </th>
              <th
                colSpan={4}
                className="text-center text-[10px] font-semibold tracking-[.1em] uppercase text-amber-hi px-2 pt-1.5 border-l border-hairline"
              >
                IN · when you deliver here
              </th>
            </tr>
            <tr className="text-[10px] font-semibold tracking-[.1em] uppercase text-faint">
              <th className="text-left px-2 py-1.5 border-b border-hairline">Market</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">loads</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">typ $/mi</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">$/day</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">grade</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline border-l">deliv</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">reload</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">idle</th>
              <th className="text-right px-1.5 py-1.5 border-b border-hairline">grade</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const isSel = selected === row.state;
              const isHot = hovered === row.state;
              return (
                <tr
                  key={row.state}
                  className={`cursor-pointer border-b border-hairline-lo tabular-nums ${
                    isSel ? "bg-amber/12" : isHot ? "bg-white/[.04]" : ""
                  }`}
                  onClick={() => onSelect(isSel ? null : row.state)}
                  onMouseEnter={() => onHover(row.state)}
                  onMouseLeave={() => onHover(null)}
                >
                  <td className="text-left px-2 py-[6px]">
                    <span className="flex items-baseline gap-1.5 min-w-0">
                      <b className="text-ink font-semibold shrink-0">{row.state}</b>
                      <span className="text-dim truncate" title={row.markets.join(" · ")}>
                        {row.markets.join(" · ")}
                      </span>
                    </span>
                  </td>
                  <td className="text-right px-1.5 py-[6px] text-dim">{row.out.loads}</td>
                  <td className="text-right px-1.5 py-[6px] text-ink font-semibold">
                    {fmtRpm(row.out.typicalRpm)}
                  </td>
                  <td
                    className={`text-right px-1.5 py-[6px] ${perDayTextClass(
                      perDayTone(row.out.perDay.perDay, daily),
                    )}`}
                  >
                    {fmtPerDay(row.out.perDay.perDay)}
                  </td>
                  <td className="text-right px-1.5 py-[6px]">
                    <GradeChip grade={row.out.grade} />
                  </td>
                  <td className="text-right px-1.5 py-[6px] text-dim border-l border-hairline">
                    {row.in.deliveries}
                  </td>
                  <td className="text-right px-1.5 py-[6px] text-dim">
                    {num(row.in.reloadMilesMedian)}
                  </td>
                  <td className="text-right px-1.5 py-[6px] text-dim">
                    {num(row.in.idleDaysAvg, 1)}
                  </td>
                  <td className="text-right px-1.5 py-[6px]">
                    <GradeChip grade={row.in.grade} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {foldable > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full shrink-0 text-left flex items-center gap-2.5 px-3.5 py-2.5 border-t border-hairline-lo font-condensed font-semibold text-[13px] text-ink hover:bg-white/[.03]"
        >
          <span className="text-dim font-medium">
            {expanded ? "− hide the thin rows" : "+"}{" "}
            {!expanded && (
              <>
                {fold.foldedOrigins.length} one-load origin
                {fold.foldedOrigins.length === 1 ? "" : "s"}
                {fold.foldedOrigins.length > 0 && (
                  <> ({fold.foldedOrigins.join(" · ")})</>
                )}{" "}
                and {fold.foldedDeliveryStates} one-delivery {grainWord}
                {fold.foldedDeliveryStates === 1 ? "" : "s"} — thin rows fold here, the
                map hatches them
              </>
            )}
          </span>
        </button>
      )}
    </>
  );
};
