import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import type { Truck } from "@/types/truck";
import type { Trailer } from "@/types/trailer";
import { getMaintenanceItems, getMaintenanceServices } from "@/services/maintenanceService";
import { getTrucks } from "@/services/trucksService";
import { getTrailers } from "@/services/trailersService";
import { readingOf, servicesCsv } from "@/lib/maintenance/serviceCsv";
import { kindLabel } from "@/lib/maintenance/serviceKind";
import { quarterOf } from "@/lib/maintenance/paperwork";
import { localDayKey } from "@/lib/relationships/dayKeys";
import { moneyCents } from "@/lib/format";

// THE QUARTER'S LOG, PRINTED (the Maintenance sheet, call 8): the range's
// services in the columns Landstar's Maintenance Report asks for — date, unit,
// reading, what, where, cost — on a page made to print, with a CSV of the
// same rows. The range comes from the query string (?from=YYYY-MM&to=YYYY-MM)
// and defaults to this calendar quarter.

const UNIT_WORD: Record<string, string> = {
  tractor: "Truck",
  trailer: "Trailer",
  both: "Truck + trailer",
  apu: "APU",
};

const fmtMonth = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const MONTH = /^\d{4}-\d{2}$/;

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const MaintenanceReportPage = () => {
  const [params] = useSearchParams();
  const today = localDayKey(new Date());
  const q = quarterOf(today);
  const from = MONTH.test(params.get("from") ?? "") ? (params.get("from") as string) : q.from;
  const to = MONTH.test(params.get("to") ?? "") ? (params.get("to") as string) : q.to;

  const [services, setServices] = useState<MaintenanceService[] | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getMaintenanceServices(), getMaintenanceItems(), getTrucks(), getTrailers()]).then((r) => {
      if (!active) return;
      if (r[0].status === "fulfilled") setServices(r[0].value);
      else setFailed(true);
      if (r[1].status === "fulfilled") setItems(r[1].value);
      if (r[2].status === "fulfilled") setTrucks(r[2].value);
      if (r[3].status === "fulfilled") setTrailers(r[3].value);
    });
    return () => {
      active = false;
    };
  }, []);

  // No manual memo: the compiler memoizes, and the query-string range would
  // only fight it.
  const nameById = new Map(items.map((i) => [i.item_id, i.name]));
  const rows = (services ?? [])
    .filter((s) => {
      const m = s.service_date.slice(0, 7);
      return m >= from && m <= to;
    })
    .sort((a, b) => a.service_date.localeCompare(b.service_date));
  const total = rows.reduce((s, x) => s + (x.cost ?? 0), 0);
  const unpriced = rows.filter((x) => x.cost == null).length;
  const rig = [
    trucks[0] ? `truck ${trucks[0].unit_number}` : null,
    trailers[0] ? `trailer ${trailers[0].unit_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen text-ink font-body print:text-black">
      <style>{`@media print { [data-sidebar], nav, .print-hide { display: none !important } .print-page { max-width: none !important; padding: 0 !important } body { background: white !important } }`}</style>
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 pb-10 print-page">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline print-hide">
          <Link to="/maintenance" className="font-condensed text-[14px] text-dim hover:text-ink">
            ‹ Maintenance
          </Link>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => download(`maintenance-${from}-${to}.csv`, servicesCsv(rows, nameById))}
            className="h-9 px-3 rounded-[10px] border border-hairline font-condensed font-semibold text-[13.5px] text-amber-hi hover:bg-amber/[.08]"
            disabled={services == null}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14.5px] bg-amber text-on-amber"
          >
            Print
          </button>
        </div>

        <div className="mt-5">
          <p className="font-condensed uppercase tracking-widest text-[11px] text-faint">Maintenance report</p>
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none mt-1">
            {fmtMonth(from)}
            {from !== to ? ` – ${fmtMonth(to)}` : ""}
          </h1>
          <p className="font-condensed text-[14px] text-dim mt-1.5">
            Delgado Trucking Services{rig ? ` · ${rig}` : ""} · printed {fmtDate(today)} · from the dash maintenance log
          </p>
        </div>

        {failed ? (
          <p className="font-condensed text-[14px] text-amber-hi mt-6">The log didn't come through — nothing to print.</p>
        ) : services == null ? (
          <p className="font-condensed text-[14px] text-faint mt-6">loading the log…</p>
        ) : rows.length === 0 ? (
          <p className="font-condensed text-[14px] text-faint mt-6">No services logged in this range.</p>
        ) : (
          <table className="w-full mt-5 font-condensed text-[13.5px] border-t border-hairline" data-testid="report-table">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[.12em] text-faint">
                <th className="text-left font-semibold py-2 pr-3">Date</th>
                <th className="text-left font-semibold py-2 pr-3">Unit</th>
                <th className="text-right font-semibold py-2 pr-3">Reading</th>
                <th className="text-left font-semibold py-2 pr-3">Work done</th>
                <th className="text-left font-semibold py-2 pr-3">Kind</th>
                <th className="text-left font-semibold py-2 pr-3">Vendor · city</th>
                <th className="text-right font-semibold py-2 pr-3">Cost</th>
                <th className="text-left font-semibold py-2">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.service_id} className="border-t ds2-cell-rule align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-dim">{fmtDate(s.service_date)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-dim">{UNIT_WORD[s.unit] ?? s.unit}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-dim whitespace-nowrap">{readingOf(s) || "—"}</td>
                  <td className="py-2 pr-3 text-ink">
                    {s.description}
                    {s.item_ids.length > 0 && (
                      <span className="block text-[12px] text-faint">
                        {s.item_ids.map((id) => nameById.get(id) ?? "clock").join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-dim">{s.kind ? kindLabel(s.kind) : "—"}</td>
                  <td className="py-2 pr-3 text-dim">
                    {s.vendor ?? "—"}
                    {s.location && <span className="block text-[12px] text-faint">{s.location}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink whitespace-nowrap">{moneyCents(s.cost)}</td>
                  <td className="py-2 text-faint">{s.invoice_number ?? "—"}</td>
                </tr>
              ))}
              <tr className="border-t border-hairline font-semibold">
                <td className="py-2 pr-3" colSpan={6}>
                  {rows.length} service{rows.length === 1 ? "" : "s"}
                  {unpriced > 0 ? ` · ${unpriced} unpriced` : ""}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{moneyCents(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MaintenanceReportPage;
