import { Link } from "react-router-dom";
import type { ComplianceItem } from "@/types/compliance";
import type { MaintenanceService } from "@/types/maintenance";
import { money } from "@/lib/format";
import { paperworkRows, quarterOf, daysUntil } from "@/lib/maintenance/paperwork";

// THE PAPERWORK the log exists to feed (the Maintenance sheet, call 8):
// Landstar's quarterly Maintenance Report and the Landstar 120 inspection live
// on the Compliance page; their dates belong where the work is, with a door
// to Compliance and a door to the quarter's log printed in the report's
// columns.

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const PaperworkPanel = ({
  items,
  services,
  today,
}: {
  items: ComplianceItem[];
  services: MaintenanceService[];
  today: string;
}) => {
  const rows = paperworkRows(items);
  const q = quarterOf(today);
  const quarter = services.filter((s) => s.service_date >= q.start && s.service_date <= today);
  const total = quarter.reduce((s, x) => s + (x.cost ?? 0), 0);
  return (
    <div className="ds2-board p-4" data-testid="paperwork">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="ds2-label">Paperwork</p>
        <span className="font-condensed text-[12px] text-faint">Landstar's quarter · from Compliance</span>
      </div>
      {rows.length === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint mt-3">
          No Landstar paperwork on{" "}
          <Link to="/compliance" className="text-amber-hi hover:text-hot">
            Compliance
          </Link>{" "}
          yet — file the Landstar 120 and the Maintenance Report there and their dates show here.
        </p>
      ) : (
        <table className="w-full mt-2 font-condensed text-[13.5px]">
          <tbody>
            {rows.map((r) => {
              const d = daysUntil(r.expires, today);
              const cls =
                d < 0 ? "text-status-negative-text" : d <= 30 ? "text-amber-hi" : "text-dim";
              return (
                <tr key={r.label} className="border-t ds2-cell-rule first:border-t-0">
                  <td className="py-[6px] text-ink">{r.label}</td>
                  <td className="py-[6px] text-faint">{r.scopes}</td>
                  <td className={`py-[6px] text-right tabular-nums whitespace-nowrap ${cls}`}>
                    {d < 0 ? `${Math.abs(d)} days over` : `due ${fmtDate(r.expires)} · ${d} day${d === 1 ? "" : "s"}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="font-condensed text-[12.5px] text-faint mt-3">
        the quarter's log so far: <b className="text-ink">{quarter.length}</b> service{quarter.length === 1 ? "" : "s"} ·{" "}
        <b className="text-ink">{money(total)}</b> ·{" "}
        <Link to={`/maintenance/report?from=${q.from}&to=${q.to}`} className="text-amber-hi hover:text-hot">
          print the report ›
        </Link>{" "}
        ·{" "}
        <Link to="/compliance" className="text-amber-hi hover:text-hot">
          Compliance ›
        </Link>
      </p>
    </div>
  );
};
