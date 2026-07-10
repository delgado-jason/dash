import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import {
  getFuelEntries,
  createFuelEntry,
  deleteFuelEntry,
} from "@/services/fuelService";
import { getTrucks } from "@/services/trucksService";
import {
  fuelStats,
  weeklyCostSeries,
  isFull,
  entryCost,
} from "@/lib/metrics/fuelEconomy";
import { Kpi } from "@/components/Kpi";
import { MpgChart } from "@/components/fuel/MpgChart";
import { WeeklyCostChart } from "@/components/fuel/WeeklyCostChart";

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

const FuelEntriesPage = () => {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [truckId, setTruckId] = useState("");
  const [date, setDate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [gallons, setGallons] = useState("");
  const [price, setPrice] = useState("");
  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");

  const load = () =>
    Promise.all([getFuelEntries(), getTrucks()])
      .then(([e, t]) => {
        setEntries(e);
        setTrucks(t);
        if (t.length === 1) setTruckId(t[0].truck_id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const now = new Date();
  const stats = useMemo(() => fuelStats(entries, now), [entries]);
  const weekly = useMemo(() => weeklyCostSeries(entries), [entries]);
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

  const save = async () => {
    setError(null);
    if (!truckId) {
      setError("Add a truck first (Fleet → Trucks).");
      return;
    }
    if (!date || !odometer || !gallons || !price || !stateCode.trim()) {
      setError("Date, odometer, gallons, price, and state are required.");
      return;
    }
    setBusy(true);
    try {
      await createFuelEntry({
        truck_id: truckId,
        fuel_date: date,
        gallons: parseFloat(gallons),
        price_per_gallon: parseFloat(price),
        odometer_reading: parseInt(odometer, 10),
        company_name: company.trim() || null,
        fuel_city: city.trim() || null,
        fuel_state: stateCode.trim().toUpperCase(),
      });
      setDate("");
      setOdometer("");
      setGallons("");
      setPrice("");
      setCompany("");
      setCity("");
      setStateCode("");
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

      {showForm && (
        <div className="bg-plate rounded-lg p-4 mt-4">
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
              <label className={lbl}>Price / gal</label>
              <input
                className={inputCls}
                value={price}
                inputMode="decimal"
                placeholder="4.033"
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>Vendor</label>
              <input
                className={inputCls}
                value={company}
                placeholder="Pilot"
                onChange={(e) => setCompany(e.target.value)}
              />
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
              <input
                className={inputCls}
                value={stateCode}
                maxLength={2}
                placeholder="AL"
                onChange={(e) => setStateCode(e.target.value)}
              />
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
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <MpgChart windows={stats.windows} />
        <WeeklyCostChart data={weekly} avg={stats.avgWeeklyCost90} />
      </div>

      <div className="bg-plate rounded-lg p-4 mt-4 overflow-x-auto">
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
      </div>
    </div>
  );
};

export default FuelEntriesPage;
