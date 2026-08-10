import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useVendors } from "@/hooks/useVendors";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import {
  createMaintenanceService,
  deleteMaintenanceService,
  type ServiceInput,
} from "@/services/maintenanceService";
import { ServiceForm } from "./ServiceForm";
import { moneyCents } from "@/lib/format";

interface Props {
  services: MaintenanceService[];
  items: MaintenanceItem[];
  onChange: () => void;
  openSignal?: number; // bumping it opens the log-service form (statusbar CTA)
}

const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));

// The reading cell: truck odometer, trailer hub, or both stacked for a
// combined service.
const reading = (s: MaintenanceService) => {
  if (s.unit === "both")
    return (
      <>
        {num(s.odometer)}
        {s.trailer_hub != null && (
          <span className="text-xs block">{num(s.trailer_hub)} hub</span>
        )}
      </>
    );
  return num(s.unit === "trailer" ? s.trailer_hub : s.odometer);
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// 'YYYY-MM' for a month offset from the current UTC month.
const monthKey = (offset: number): string => {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
};

const fmtMonth = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type RangeMode = "3m" | "6m" | "12m" | "ytd" | "all" | "custom";
const PRESETS: [RangeMode, string][] = [
  ["3m", "3 months"],
  ["6m", "6 months"],
  ["12m", "12 months"],
  ["ytd", "This year"],
  ["all", "All time"],
  ["custom", "Custom"],
];

export const ServicesTab = ({ services, items, onChange, openSignal = 0 }: Props) => {
  // The rolodex, for linking vendor names through the bridge (same name rule
  // the spend readout uses).
  const { vendors: rolodex } = useVendors(0);
  const vendorIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of rolodex) m.set(v.name.trim().toLowerCase(), v.vendor_id);
    return m;
  }, [rolodex]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);
  // Month range for pulling a window of services (e.g. to re-enter into
  // Landstar's app). Presets cover the common cases; "Custom" reveals dropdowns.
  const [mode, setMode] = useState<RangeMode>("3m");

  useEffect(() => {
    if (openSignal > 0) setShowForm(true);
  }, [openSignal]);
  const [customFrom, setCustomFrom] = useState(() => monthKey(-2));
  const [customTo, setCustomTo] = useState(() => monthKey(0));

  const { from, to } = useMemo(() => {
    if (mode === "custom") return { from: customFrom, to: customTo };
    if (mode === "all") return { from: "", to: "" };
    if (mode === "ytd")
      return { from: `${new Date().getUTCFullYear()}-01`, to: monthKey(0) };
    const back = mode === "3m" ? -2 : mode === "6m" ? -5 : -11;
    return { from: monthKey(back), to: monthKey(0) };
  }, [mode, customFrom, customTo]);

  // Months that actually have services (newest first) for the custom dropdowns.
  // Capped at ~36 months back so one stray/typo'd date can't balloon the list
  // into hundreds of options (that was the click lag).
  const monthOptions = useMemo(() => {
    const floor = monthKey(-35);
    const months = services.map((s) => s.service_date.slice(0, 7));
    const earliestSvc = months.length
      ? months.reduce((a, b) => (a < b ? a : b))
      : monthKey(-11);
    const earliest = earliestSvc < floor ? floor : earliestSvc;
    const [ey, em] = earliest.split("-").map(Number);
    const out: string[] = [];
    const d = new Date();
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth() + 1;
    while (y > ey || (y === ey && m >= em)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      if (--m === 0) {
        m = 12;
        y--;
      }
    }
    return out;
  }, [services]);

  const nameById = new Map(items.map((i) => [i.item_id, i.name]));

  const filtered = services.filter((s) => {
    const m = s.service_date.slice(0, 7);
    return (!from || m >= from) && (!to || m <= to);
  });
  const rangeTotal = filtered.reduce((sum, s) => sum + (s.cost ?? 0), 0);

  // Vendor pricing (over the selected range): what each shop has cost you.
  const byVendor = new Map<string, { count: number; total: number; priced: number }>();
  for (const s of filtered) {
    if (!s.vendor) continue;
    const v = byVendor.get(s.vendor) ?? { count: 0, total: 0, priced: 0 };
    v.count++;
    if (s.cost != null) {
      v.total += s.cost;
      v.priced++;
    }
    byVendor.set(s.vendor, v);
  }
  const vendors = [...byVendor.entries()].sort((a, b) => b[1].total - a[1].total);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const save = (data: ServiceInput) =>
    run(async () => {
      await createMaintenanceService(data);
      setShowForm(false);
      setJustLogged(true);
      window.setTimeout(() => setJustLogged(false), 2600);
    });

  const VendorCell = ({ name, location }: { name: string | null; location?: string | null }) => {
    if (!name) return <span className="text-faint">—</span>;
    const id = vendorIdByName.get(name.trim().toLowerCase());
    return (
      <span className="min-w-0">
        {id ? (
          <Link
            to={`/vendors/${id}`}
            className="font-semibold text-amber-hi hover:text-hot"
          >
            {name}
          </Link>
        ) : (
          <>
            <span className="text-dim">{name}</span>{" "}
            <Link to="/vendors" className="text-[10.5px] text-faint hover:text-amber-hi">
              · file it →
            </Link>
          </>
        )}
        {location && <span className="block text-xs text-faint">{location}</span>}
      </span>
    );
  };

  return (
    <div>
      {justLogged && (
        <div className="ds2-board flex items-center gap-3 px-4 py-3 mt-4">
          <span className="font-forge font-bold text-[13px] tracking-[.12em] text-[#6fd08c]">
            SERVICE LOGGED ✓
          </span>
          <span className="font-condensed text-[13px] text-dim">
            the clocks it covered just reset.
          </span>
        </div>
      )}

      {error && <p className="text-destructive text-sm mt-3">{error}</p>}

      {showForm && (
        <div className="mt-4">
          <ServiceForm
            items={items}
            onSave={save}
            onCancel={() => setShowForm(false)}
            busy={busy}
          />
        </div>
      )}

      {/* range + summary */}
      <div className="flex items-center gap-3 flex-wrap mt-4">
        <span className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px]" style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}>
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-2.5 rounded-md font-condensed font-semibold text-[12px] ${
                mode === key ? "bg-amber text-canvas" : "text-dim hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </span>
        {mode === "custom" && (
          <span className="flex items-center gap-2 font-condensed text-[12.5px] text-faint">
            <select
              className="h-[30px] px-2 rounded-[8px] bg-well border border-hairline text-ink text-[13px] outline-none"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
            →
            <select
              className="h-[30px] px-2 rounded-[8px] bg-well border border-hairline text-ink text-[13px] outline-none"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="ml-auto font-condensed text-[13px] text-faint">
          <b className="font-display text-[19px] tracking-[.03em] text-ink font-normal tabular-nums">
            {filtered.length}
          </b>{" "}
          service{filtered.length !== 1 ? "s" : ""} ·{" "}
          <b className="font-semibold text-ink tabular-nums">{moneyCents(rangeTotal)}</b>
        </span>
      </div>

      {/* by vendor — filed names link to their card */}
      {vendors.length > 0 && (
        <div className="ds2-board overflow-hidden mt-4">
          <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
            <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
              By vendor
            </span>
            <span className="font-condensed text-[12px] text-faint">
              · the range's shop money · filed names link to their card
            </span>
          </div>
          {vendors.map(([vendor, v]) => (
            <div
              key={vendor}
              className="flex items-center gap-3 px-4 py-[10px] border-t ds2-cell-rule first:border-t-0 font-condensed"
            >
              <span className="font-semibold text-[14.5px] flex-1 min-w-0 truncate">
                <VendorCell name={vendor} />
              </span>
              <span className="text-[12.5px] text-faint w-[80px] text-right">
                {v.count} visit{v.count === 1 ? "" : "s"}
              </span>
              <span className="font-semibold text-[14.5px] w-[100px] text-right tabular-nums">
                {moneyCents(v.total)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* the log */}
      {filtered.length === 0 ? (
        <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-4">
          {services.length === 0
            ? "No services logged yet."
            : "No services in this month range."}
        </p>
      ) : (
        <div className="ds2-board overflow-hidden mt-4">
          <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
            <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
              The log
            </span>
            <span className="font-condensed text-[12px] text-faint">
              · chronological · cost here tracks vendor pricing, not your P&L
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {filtered.map((sv) => (
                <div
                  key={sv.service_id}
                  className="grid grid-cols-[92px_1fr_190px_130px_90px_30px] gap-3 items-baseline px-4 py-[11px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[13.5px] text-dim"
                >
                  <span className="text-faint whitespace-nowrap">
                    {fmtDate(sv.service_date)}
                  </span>
                  <span className="min-w-0 text-ink">
                    {sv.description}
                    {sv.item_ids.length > 0 && (
                      <span className="flex flex-wrap gap-1 mt-1">
                        {sv.item_ids.map((iid) => (
                          <span
                            key={iid}
                            className="text-[10.5px] font-semibold text-faint bg-well border border-hairline-lo px-1.5 rounded-[4px]"
                          >
                            ✓ {nameById.get(iid) ?? "item"}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <VendorCell name={sv.vendor} location={sv.location} />
                  <span className="text-right text-faint text-[12.5px] tabular-nums whitespace-nowrap">
                    {reading(sv)}
                    <span className="block text-[10px] uppercase tracking-[.08em]">
                      {sv.unit}
                    </span>
                  </span>
                  <span className="text-right font-semibold text-ink tabular-nums whitespace-nowrap">
                    {moneyCents(sv.cost)}
                  </span>
                  <button
                    aria-label="Delete"
                    onClick={() =>
                      !busy && run(() => deleteMaintenanceService(sv.service_id))
                    }
                    className="text-right text-faint hover:text-[#e05252] text-[13px]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
