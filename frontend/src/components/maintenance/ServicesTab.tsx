import { useState, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import {
  createMaintenanceService,
  deleteMaintenanceService,
  type ServiceInput,
} from "@/services/maintenanceService";
import { ServiceForm } from "./ServiceForm";

interface Props {
  services: MaintenanceService[];
  items: MaintenanceItem[];
  onChange: () => void;
}

const money = (n: number | null): string =>
  n == null
    ? "—"
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export const ServicesTab = ({ services, items, onChange }: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Month range for pulling a window of services (e.g. to re-enter into
  // Landstar's app). Presets cover the common cases; "Custom" reveals dropdowns.
  const [mode, setMode] = useState<RangeMode>("3m");
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
    });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-muted-text">
          Every service, chronological — cost here tracks vendor pricing, not your
          P&amp;L.
        </p>
        {!showForm && (
          <button
            className="bg-amber text-steel px-2 py-1 rounded text-xs font-semibold flex items-center gap-1"
            onClick={() => setShowForm(true)}
          >
            <Plus size={14} /> Log service
          </button>
        )}
      </div>

      {error && <p className="text-destructive text-sm mb-3">{error}</p>}

      {showForm && (
        <ServiceForm
          items={items}
          onSave={save}
          onCancel={() => setShowForm(false)}
          busy={busy}
        />
      )}

      <div className="bg-plate rounded-lg p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`text-xs px-2.5 py-1 rounded ${
                mode === key
                  ? "bg-amber text-steel font-semibold"
                  : "bg-steel text-muted-text"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-xs text-muted-text ml-auto">
            {filtered.length} service{filtered.length !== 1 ? "s" : ""} ·{" "}
            {money(rangeTotal)}
          </span>
        </div>
        {mode === "custom" && (
          <div className="flex items-end gap-3 mt-3">
            <div>
              <label className="text-xs text-muted-text block mb-1">From</label>
              <select
                className="bg-steel rounded px-2 py-1 text-sm"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {fmtMonth(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-text block mb-1">To</label>
              <select
                className="bg-steel rounded px-2 py-1 text-sm"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {fmtMonth(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {vendors.length > 0 && (
        <div className="bg-plate rounded-lg p-4 mb-4">
          <p className="text-xs text-muted-text mb-2">Vendor pricing</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-text text-left">
                <th className="font-normal pb-1">Vendor</th>
                <th className="font-normal pb-1 text-right">Visits</th>
                <th className="font-normal pb-1 text-right">Total</th>
                <th className="font-normal pb-1 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(([vendor, v]) => (
                <tr key={vendor} className="border-t border-steel">
                  <td className="py-1.5">{vendor}</td>
                  <td className="py-1.5 text-right text-muted-text">{v.count}</td>
                  <td className="py-1.5 text-right">{money(v.total)}</td>
                  <td className="py-1.5 text-right text-muted-text">
                    {v.priced ? money(v.total / v.priced) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-muted-text text-sm">
          {services.length === 0
            ? "No services logged yet."
            : "No services in this month range."}
        </p>
      ) : (
        <div className="bg-plate rounded-lg p-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px] [&_th]:pr-5 [&_td]:pr-5 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
            <thead>
              <tr className="text-xs text-muted-text text-left">
                <th className="font-normal pb-2">Date</th>
                <th className="font-normal pb-2">Unit</th>
                <th className="font-normal pb-2">Vendor</th>
                <th className="font-normal pb-2 text-right">Odo</th>
                <th className="font-normal pb-2">Service</th>
                <th className="font-normal pb-2 text-right">Cost</th>
                <th className="font-normal pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.service_id} className="border-t border-steel align-top">
                  <td className="py-2 whitespace-nowrap">{fmtDate(s.service_date)}</td>
                  <td className="py-2 text-muted-text">{s.unit}</td>
                  <td className="py-2">
                    {s.vendor ?? "—"}
                    {s.location && (
                      <span className="text-xs text-muted-text block">
                        {s.location}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-muted-text whitespace-nowrap">
                    {s.odometer != null ? s.odometer.toLocaleString("en-US") : "—"}
                  </td>
                  <td className="py-2">
                    {s.description}
                    {s.item_ids.length > 0 && (
                      <span className="flex flex-wrap gap-1 mt-1">
                        {s.item_ids.map((id) => (
                          <span
                            key={id}
                            className="text-[11px] bg-steel text-muted-text px-1.5 rounded"
                          >
                            ✓ {nameById.get(id) ?? "item"}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">{money(s.cost)}</td>
                  <td className="py-2 text-right">
                    <Trash2
                      size={15}
                      className="cursor-pointer text-muted-text hover:text-destructive"
                      aria-label="Delete"
                      onClick={() =>
                        !busy && run(() => deleteMaintenanceService(s.service_id))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
