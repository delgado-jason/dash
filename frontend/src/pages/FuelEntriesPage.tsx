import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FuelEntry, NationalDiesel } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import {
  getFuelEntries,
  createFuelEntry,
  deleteFuelEntry,
  getNationalDiesel,
  getNationalDieselSeries,
  type NationalDieselMonth,
} from "@/services/fuelService";
import { getTrucks } from "@/services/trucksService";
import {
  fuelStats,
  dieselChartData,
  isFull,
  entryCost,
} from "@/lib/metrics/fuelEconomy";
import { fuelVsRevenue } from "@/lib/metrics/fuelRevenue";
import { useLoads } from "@/hooks/useLoads";
import { FUEL_VENDORS, OTHER_VENDOR, US_STATES } from "@/lib/constants/fuel";
import { Kpi } from "@/components/Kpi";
import { Panel } from "@/components/ui/Panel";
import { MpgChart } from "@/components/fuel/MpgChart";
import { DieselPriceChart } from "@/components/fuel/DieselPriceChart";
import { DieselCompareCard } from "@/components/fuel/DieselCompareCard";
import { FuelVsRevenueCard } from "@/components/fuel/FuelVsRevenueCard";

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });

const inputCls = "bg-steel rounded px-2 py-1.5 text-sm w-full text-light";
const lbl = "text-xs text-muted-text mb-1 block";

// Remember the last vendor + state so the next fill-up defaults to them.
const LS_VENDOR = "dash.fuel.lastVendor";
const LS_STATE = "dash.fuel.lastState";

const FuelEntriesPage = () => {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const { loads } = useLoads(0);
  const [national, setNational] = useState<NationalDiesel | null>(null);
  const [nationalSeries, setNationalSeries] = useState<NationalDieselMonth[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [truckId, setTruckId] = useState("");
  const [date, setDate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [gallons, setGallons] = useState("");
  const [total, setTotal] = useState("");
  // Vendor + state default to your last fill-up (remembered across reloads), so
  // logging a stop is a couple taps and the fields stop coming up blank.
  const [company, setCompany] = useState(
    () => localStorage.getItem(LS_VENDOR) || "",
  );
  const [vendorIsOther, setVendorIsOther] = useState(
    () =>
      !!localStorage.getItem(LS_VENDOR) &&
      !FUEL_VENDORS.includes(
        (localStorage.getItem(LS_VENDOR) ||
          "") as (typeof FUEL_VENDORS)[number],
      ),
  );
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState(
    () => localStorage.getItem(LS_STATE) || "",
  );

  const load = () =>
    Promise.all([getFuelEntries(), getTrucks()])
      .then(([e, t]) => {
        setEntries(e);
        setTrucks(t);
        if (t.length === 1) setTruckId(t[0].truck_id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  // National diesel is best-effort — never let it block or break the page.
  useEffect(() => {
    getNationalDiesel()
      .then(setNational)
      .catch(() => {});
    getNationalDieselSeries()
      .then(setNationalSeries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, []);

  const now = new Date();
  const stats = useMemo(() => fuelStats(entries, now), [entries]);
  const fuelRev = useMemo(
    () => fuelVsRevenue(entries, loads),
    [entries, loads],
  );
  const dieselData = useMemo(
    () => dieselChartData(entries, nationalSeries),
    [entries, nationalSeries],
  );
  // Per-full MPG, keyed by the closing odometer of each window.
  const mpgByOdo = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of stats.windows) m.set(w.toOdometer, w.mpg);
    return m;
  }, [stats]);

  const rows = useMemo(
    () => [...entries].sort((a, b) => b.odometer_reading - a.odometer_reading),
    [entries],
  );

  // Price/gallon is derived from the total paid ÷ gallons — the numbers on the
  // receipt — rounded to the 3-decimal cents diesel is quoted in.
  const g = parseFloat(gallons);
  const t = parseFloat(total);
  const computedPpg =
    g > 0 && t > 0 && isFinite(g) && isFinite(t) ? t / g : null;

  const save = async () => {
    setError(null);
    if (!truckId) {
      setError("Add a truck first (Fleet → Trucks).");
      return;
    }
    if (!date || !odometer || !gallons || !total || !stateCode.trim()) {
      setError("Date, odometer, gallons, total, and state are required.");
      return;
    }
    if (computedPpg == null) {
      setError("Enter gallons and total so price/gallon can be calculated.");
      return;
    }
    setBusy(true);
    try {
      await createFuelEntry({
        truck_id: truckId,
        fuel_date: date,
        gallons: parseFloat(gallons),
        price_per_gallon: Number(computedPpg.toFixed(3)),
        odometer_reading: parseInt(odometer, 10),
        company_name: company.trim() || null,
        fuel_city: city.trim() || null,
        fuel_state: stateCode.trim().toUpperCase(),
      });
      // Remember vendor + state for the next fill (kept, not cleared).
      if (company.trim()) localStorage.setItem(LS_VENDOR, company.trim());
      localStorage.setItem(LS_STATE, stateCode.trim().toUpperCase());
      setDate("");
      setOdometer("");
      setGallons("");
      setTotal("");
      setCity("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not save the fill-up",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteFuelEntry(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const truck = trucks.find((t) => t.truck_id === truckId);

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-start mb-6 gap-3">
        <div>
          <h1 className="text-3xl font-condensed">Fuel</h1>
          {truck && (
            <p className="text-xs text-muted-text">
              Unit {truck.unit_number}
              {[truck.make, truck.model].filter(Boolean).length
                ? ` · ${[truck.make, truck.model].filter(Boolean).join(" ")}`
                : ""}
            </p>
          )}
        </div>
        {!showForm && (
          <button
            className="bg-amber text-steel px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 shrink-0"
            onClick={() => setShowForm(true)}
          >
            <Plus size={15} /> Add fill-up
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <Kpi
          label="Avg MPG"
          value={stats.avgMpg == null ? "—" : stats.avgMpg.toFixed(2)}
        />
        <Kpi
          label="Cost / mile"
          value={
            stats.costPerMile == null ? "—" : `$${stats.costPerMile.toFixed(2)}`
          }
        />
        <Kpi
          label="Cost / gallon"
          value={
            stats.avgCostPerGallon == null
              ? "—"
              : `$${stats.avgCostPerGallon.toFixed(2)}`
          }
        />
        <Kpi
          label="Avg weekly · 90d"
          value={
            stats.avgWeeklyCost90 == null ? "—" : money0(stats.avgWeeklyCost90)
          }
        />
        <Kpi
          label="Total gallons"
          value={Math.round(stats.totalGallons).toLocaleString("en-US")}
        />
        <Kpi label="Total spend" value={money0(stats.totalSpend)} />
      </div>

      <DieselCompareCard
        national={national}
        yourCostPerGallon={stats.avgCostPerGallon}
      />

      <FuelVsRevenueCard data={fuelRev} />

      {showForm && (
        <Panel className="p-4 mt-4">
          <p className="text-sm font-medium mb-3">Add fill-up</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Date</label>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>Odometer</label>
              <input
                className={inputCls}
                value={odometer}
                inputMode="numeric"
                placeholder="582450"
                onChange={(e) => setOdometer(e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>Gallons</label>
              <input
                className={inputCls}
                value={gallons}
                inputMode="decimal"
                placeholder="137.8"
                onChange={(e) => setGallons(e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>Total $</label>
              <input
                className={inputCls}
                value={total}
                inputMode="decimal"
                placeholder="555.90"
                onChange={(e) => setTotal(e.target.value)}
              />
              <p className="text-[11px] mt-1 text-amber-light">
                {computedPpg == null
                  ? "= —/gal"
                  : `= $${computedPpg.toFixed(3)}/gal`}
              </p>
            </div>
            <div>
              <label className={lbl}>Vendor</label>
              <select
                className={inputCls}
                value={vendorIsOther ? OTHER_VENDOR : company}
                onChange={(e) => {
                  if (e.target.value === OTHER_VENDOR) {
                    setVendorIsOther(true);
                    setCompany("");
                  } else {
                    setVendorIsOther(false);
                    setCompany(e.target.value);
                  }
                }}
              >
                <option value="">Select…</option>
                {FUEL_VENDORS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                <option value={OTHER_VENDOR}>Other…</option>
              </select>
              {vendorIsOther && (
                <input
                  className={`${inputCls} mt-1`}
                  value={company}
                  placeholder="Vendor name"
                  onChange={(e) => setCompany(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className={lbl}>City</label>
              <input
                className={inputCls}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>State</label>
              <select
                className={inputCls}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
              >
                <option value="">Select…</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {trucks.length > 1 && (
              <div>
                <label className={lbl}>Truck</label>
                <select
                  className={inputCls}
                  value={truckId}
                  onChange={(e) => setTruckId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {trucks.map((t) => (
                    <option key={t.truck_id} value={t.truck_id}>
                      Unit {t.unit_number}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-text mt-2">
            120+ gallons counts as a full tank; anything less is a partial.
          </p>
          {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              className="bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
              onClick={save}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save fill-up"}
            </button>
            <button
              className="bg-steel text-light px-3 py-1.5 rounded text-sm"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <MpgChart windows={stats.windows} />
        <DieselPriceChart data={dieselData} />
      </div>

      <Panel className="p-4 mt-4 overflow-x-auto">
        <p className="text-xs text-muted-text uppercase tracking-wider mb-3">
          Fill-ups
        </p>
        {loading ? (
          <p className="text-sm text-muted-text">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-text">
            No fill-ups yet — add your first above.
          </p>
        ) : (
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-xs text-muted-text text-left">
                <th className="font-normal pb-2 pr-4">Date</th>
                <th className="font-normal pb-2 pr-4">Odometer</th>
                <th className="font-normal pb-2 pr-4 text-right">Gallons</th>
                <th className="font-normal pb-2 pr-4">Type</th>
                <th className="font-normal pb-2 pr-4">Vendor</th>
                <th className="font-normal pb-2 pr-4 text-right">$/gal</th>
                <th className="font-normal pb-2 pr-4 text-right">Total</th>
                <th className="font-normal pb-2 pr-4 text-right">MPG</th>
                <th className="font-normal pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const full = isFull(e);
                const mpg = mpgByOdo.get(e.odometer_reading);
                return (
                  <tr
                    key={e.fuel_entry_id}
                    className="border-t border-[#3b4660]"
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {fmtDate(e.fuel_date)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-text">
                      {e.odometer_reading.toLocaleString("en-US")}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {e.gallons.toFixed(1)}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: full ? "#1a3a2a" : "#3a2a0a",
                          color: full ? "#4ade80" : "#e8940a",
                        }}
                      >
                        {full ? "Full" : "Partial"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-muted-text">
                      {e.company_name || "—"}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      ${e.price_per_gallon.toFixed(3)}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {money2(entryCost(e))}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {full && mpg != null ? mpg.toFixed(2) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <Trash2
                        size={14}
                        className="cursor-pointer text-muted-text hover:text-destructive"
                        aria-label="Delete"
                        onClick={() => remove(e.fuel_entry_id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
};

export default FuelEntriesPage;
