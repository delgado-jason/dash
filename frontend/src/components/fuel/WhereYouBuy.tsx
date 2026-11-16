import { useState } from "react";
import type { DieselMonth, PriceVsNationalRow } from "@/lib/metrics/fuelEconomy";
import { nationalVerdict } from "@/lib/metrics/fuelEconomy";
import type { VendorLine } from "@/lib/metrics/fuelVendors";
import type { FuelTaxMonth } from "@/lib/metrics/fuelTax";
import { fuelTaxLine, unassignedLine, vendorSentence } from "@/lib/metrics/fuelWords";
import { money } from "@/lib/format";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { DieselPriceChart } from "./DieselPriceChart";
import { PartHeader, SubHeading } from "./PartHeader";
import { monthShort } from "./format";

export interface StateRow {
  st: string;
  fills: number;
  gal: number;
  spend: number;
}
export interface Unassigned {
  fills: number;
  gal: number;
  spend: number;
  from: string | null;
  to: string | null;
}

const TOP_STATES = 5;

// Part 03 — WHERE YOU BUY. By vendor (the fold makes one truck stop one
// vendor), against the national (the numbers beside the chart that already
// drew both lines), by state with Landstar's FUEL TAX line read from the
// settlements — the check, not a form to re-enter (the Fuel page sheet, calls
// 3 and 4).
export const WhereYouBuy = ({
  vendors,
  priceRows,
  chartData,
  states,
  unassigned,
  fuelTax,
  fuelTaxFailed,
  onRetryFuelTax,
  logFrom,
}: {
  vendors: VendorLine[];
  priceRows: PriceVsNationalRow[];
  chartData: DieselMonth[];
  states: StateRow[];
  unassigned: Unassigned;
  fuelTax: FuelTaxMonth[] | null; // null until the settlements land
  fuelTaxFailed: boolean;
  onRetryFuelTax: () => void;
  logFrom: string | null; // the log's first day
}) => {
  const [allStates, setAllStates] = useState(false);
  const sentence = vendorSentence(vendors);
  const verdict = nationalVerdict(priceRows);
  const maxGal = Math.max(1, ...states.map((r) => r.gal));
  const shownStates = allStates ? states : states.slice(0, TOP_STATES);
  const rest = states.slice(TOP_STATES);

  return (
    <div className="ds2-board overflow-hidden mt-4">
      <PartHeader n="03" title="WHERE YOU BUY" sub="by vendor · against the national · by state, with Landstar's fuel-tax line" />

      {/* by vendor */}
      <SubHeading>By vendor · lifetime</SubHeading>
      {vendors.length === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint px-4 pb-3">No fill-ups logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] font-condensed text-[13.5px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
                <th className="text-left font-semibold px-4 py-1.5">vendor</th>
                <th className="text-right font-semibold px-2 py-1.5">fills</th>
                <th className="text-right font-semibold px-2 py-1.5">gal</th>
                <th className="text-right font-semibold px-4 py-1.5">your $/gal</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.vendor ?? "—"} className="border-t ds2-cell-rule text-dim" data-vendor={v.vendor ?? ""}>
                  <td className={`px-4 py-[6px] ${v.vendor ? "text-ink" : "text-faint"}`}>{v.vendor ?? "no vendor · the import"}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums">{v.fills}</td>
                  <td className="px-2 py-[6px] text-right tabular-nums">{Math.round(v.gallons).toLocaleString("en-US")}</td>
                  <td className="px-4 py-[6px] text-right tabular-nums text-ink">{v.ppg == null ? "—" : `$${v.ppg.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sentence && <p className="font-condensed text-[13.5px] text-dim px-4 pt-2 pb-3">{sentence}</p>}

      {/* against the national */}
      <div className="border-t ds2-cell-rule">
        <SubHeading>You vs the national · by month</SubHeading>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 px-0">
          <div>
            {priceRows.length === 0 ? (
              <p className="font-condensed text-[13.5px] text-faint px-4 pb-3">No fill-ups logged yet.</p>
            ) : (
              <table className="w-full font-condensed text-[13.5px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
                    <th className="text-left font-semibold px-4 py-1.5">month</th>
                    <th className="text-right font-semibold px-2 py-1.5">you</th>
                    <th className="text-right font-semibold px-2 py-1.5">eia</th>
                    <th className="text-right font-semibold px-4 py-1.5">under by</th>
                  </tr>
                </thead>
                <tbody>
                  {priceRows.map((r) => (
                    <tr key={r.month} className="border-t ds2-cell-rule text-dim" data-month={r.month}>
                      <td className="px-4 py-[6px] text-ink">{monthShort(r.month)}</td>
                      <td className="px-2 py-[6px] text-right tabular-nums text-ink">${r.you.toFixed(2)}</td>
                      <td className="px-2 py-[6px] text-right tabular-nums">{r.national == null ? "—" : `$${r.national.toFixed(2)}`}</td>
                      <td className="px-4 py-[6px] text-right tabular-nums">
                        {r.under == null ? (
                          <span className="text-faint">no EIA figure</span>
                        ) : r.under >= 0 ? (
                          <span className="text-status-positive-text">${r.under.toFixed(2)}</span>
                        ) : (
                          <span className="text-status-negative-text">over by ${Math.abs(r.under).toFixed(2)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {verdict && <p className="font-condensed text-[13px] text-dim px-4 pt-2 pb-3">{verdict}</p>}
          </div>
          <div className="px-4 pb-3 lg:pl-0">
            <DieselPriceChart data={chartData} />
            <p className="font-condensed text-[12px] text-faint mt-1">your gallon-weighted $/gal by month against the EIA's U.S. retail average</p>
          </div>
        </div>
      </div>

      {/* by state, with the fuel-tax line */}
      <div className="border-t ds2-cell-rule">
        <SubHeading>By state · lifetime</SubHeading>
        {fuelTaxFailed ? (
          <FetchFailed what="the settlements" onRetry={onRetryFuelTax} className="px-4 pb-2" />
        ) : (
          <p className="font-condensed text-[13px] text-dim px-4 pb-2">{fuelTax == null ? "reading the settlements…" : fuelTaxLine(fuelTax, logFrom)}</p>
        )}
        {states.length === 0 && unassigned.fills === 0 ? (
          <p className="font-condensed text-[13.5px] text-faint px-4 pb-3">No fill-ups logged yet.</p>
        ) : (
          <>
            {shownStates.map((r) => (
              <div key={r.st} className="flex items-center gap-3 px-4 py-[8px] border-t ds2-cell-rule font-condensed" data-state={r.st}>
                <span className="font-display text-[18.5px] tracking-[.05em] w-[40px]">{r.st}</span>
                <span className="flex-1 h-[8px] rounded-[3px] overflow-hidden" style={{ background: "var(--color-well)", boxShadow: "var(--shadow-inset)" }}>
                  <i className="block h-full" style={{ width: `${(r.gal / maxGal) * 100}%`, background: "var(--color-amber-dark)" }} />
                </span>
                <span className="w-[130px] text-right text-[14px] text-dim tabular-nums">
                  {r.fills} fill{r.fills === 1 ? "" : "s"} · {Math.round(r.gal)} gal
                </span>
                <span className="w-[80px] text-right font-semibold text-[14.5px] tabular-nums">{money(r.spend)}</span>
              </div>
            ))}
            {(rest.length > 0 || unassigned.fills > 0) && (
              <p className="font-condensed text-[13.5px] text-faint px-4 py-[10px] border-t ds2-cell-rule">
                {rest.length > 0 && !allStates && (
                  <>
                    …{" "}
                    <button type="button" className="text-dim hover:text-ink underline-offset-2 hover:underline" onClick={() => setAllStates(true)}>
                      {rest.map((r) => r.st).join(", ")}
                    </button>
                  </>
                )}
                {rest.length > 0 && allStates && (
                  <button type="button" className="text-dim hover:text-ink underline-offset-2 hover:underline" onClick={() => setAllStates(false)}>
                    the top five
                  </button>
                )}
                {unassigned.fills > 0 && (
                  <>
                    {rest.length > 0 ? " · and " : ""}
                    <b className="text-dim font-semibold">{unassignedLine(unassigned)}</b>: tap a row in the log to give it a state
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
