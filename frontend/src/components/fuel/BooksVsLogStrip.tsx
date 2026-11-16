import { Link } from "react-router-dom";
import type { FuelBooksRow, FuelBooksTone } from "@/lib/metrics/fuelBooks";
import { money } from "@/lib/format";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { PartHeader } from "./PartHeader";
import { monthShort } from "./format";

const TONE_CLASS: Record<FuelBooksTone, string> = {
  quiet: "text-faint",
  match: "text-status-positive-text",
  gap: "text-amber",
};

// Part 04 — THE BOOKS VS THE LOG. The P&L's Fuel line beside what you logged,
// by month, the gaps named (the Fuel page sheet, call 5). Nothing re-bases on
// the books: the thirty-day rate keeps reading the pump.
export const BooksVsLogStrip = ({
  rows,
  periodsLoaded,
  periodsFailed,
  onRetry,
}: {
  rows: FuelBooksRow[];
  periodsLoaded: boolean; // the P&L list landed (it may be empty)
  periodsFailed: boolean;
  onRetry: () => void;
}) => {
  const filed = rows.some((r) => r.books != null);
  return (
    <div className="ds2-board overflow-hidden mt-4" data-testid="fuel-books-vs-log">
      <PartHeader n="04" title="THE BOOKS VS THE LOG" sub="the P&L's Fuel line beside what you logged" />
      {periodsFailed && <FetchFailed what="the P&L" onRetry={onRetry} className="px-4 pt-3" />}
      {periodsLoaded && !periodsFailed && !filed && (
        <p className="font-condensed text-[13.5px] text-faint px-4 pt-3">
          No P&amp;L filed yet — file a month on{" "}
          <Link to="/expenses" className="text-amber-hi hover:text-hot">
            Expenses
          </Link>{" "}
          and the books appear here beside the log.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint px-4 py-3">No fill-ups logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] font-condensed text-[13.5px] mt-1">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
                <th className="text-left font-semibold px-4 py-1.5">month</th>
                <th className="text-right font-semibold px-2 py-1.5">logged</th>
                <th className="text-right font-semibold px-2 py-1.5">the books</th>
                <th className="text-left font-semibold px-4 py-1.5">read</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-t ds2-cell-rule text-dim" data-month={r.month}>
                  <td className="px-4 py-[6px] text-ink">{monthShort(r.month)}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums text-ink">{money(r.logged)}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums">{r.books == null ? "—" : money(r.books)}</td>
                  <td className={`px-4 py-[6px] ${TONE_CLASS[r.tone]}`}>{r.read}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-condensed text-[12.5px] text-faint px-4 py-2 border-t ds2-cell-rule">
        the books are the P&amp;L you file on Expenses · a month with no P&amp;L says so, never "matches" · the thirty-day rate keeps reading the pump — fuel is
        priced by the receipt, not the books
      </p>
    </div>
  );
};
