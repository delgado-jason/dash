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
  latestTankRecap,
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
import { LatestTankCard } from "@/components/fuel/LatestTankCard";
import { money, moneyCents } from "@/lib/format";
import CityAutocomplete from "@/components/CityAutocomplete";
import { Field, AffixInput, SelectControl } from "@/components/ui/FormControls";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });

// Strip commas / $ / spaces so "1,378" or "$555.90" parse cleanly (mobile
// keyboards and habit add them; parseFloat/parseInt otherwise truncate).
const numOf = (s: string) => s.replace(/[$,\s]/g, "");

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
  const [errs, setErrs] = useState<Record<string, string>>({});

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
  // The latest completed tank, scored against his history (the "last tank" card).
  const recap = useMemo(
    () => latestTankRecap(stats, nationalSeries),
    [stats, nationalSeries],
  );
  // Where that tank closed — the city/state on its closing fill-up.
  const recapPlace = useMemo(() => {
    if (!recap) return null;
    const closing = entries.find(
      (e) => e.odometer_reading === recap.tank.toOdometer,
    );
    if (!closing) return null;
    // "--" is the import placeholder for an unknown state — treat it as blank.
    const parts = [closing.fuel_city, closing.fuel_state].filter(
      (p) => p && p !== "--",
    );
    return parts.join(", ") || null;
  }, [recap, entries]);
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
  const g = parseFloat(numOf(gallons));
  const t = parseFloat(numOf(total));
  const computedPpg =
    g > 0 && t > 0 && isFinite(g) && isFinite(t) ? t / g : null;
  const ppgOver = computedPpg != null && computedPpg > 10;

  // Clear a field's error the moment the user edits it.
  const clr = (k: string) =>
    setErrs((p) => (p[k] ? { ...p, [k]: "" } : p));

  // Field-level validation mirroring the server rules, so a bad value is caught
  // inline (named on the field) before it ever hits the network.
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!date) e.date = "Pick a date.";
    const od = parseInt(numOf(odometer), 10);
    if (!odometer.trim()) e.odometer = "Required.";
    else if (!Number.isInteger(od) || od < 1 || od > 5_000_000)
      e.odometer = "Enter a whole number up to 5,000,000.";
    if (!gallons.trim()) e.gallons = "Required.";
    else if (!(g >= 1 && g <= 400))
      e.gallons = "Must be between 1 and 400 gal.";
    if (!total.trim()) e.total = "Required.";
    else if (ppgOver)
      e.total = `That's $${computedPpg!.toFixed(2)}/gal — over the $10 limit. Check gallons.`;
    else if (computedPpg == null) e.total = "Enter gallons and total.";
    if (!stateCode.trim()) e.state = "Pick a state.";
    return e;
  };

  const save = async () => {
    setError(null);
    const e = validate();
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    if (!truckId) {
      setError("Add a truck first (Fleet → Trucks).");
      return;
    }
    setBusy(true);
    try {
      await createFuelEntry({
        truck_id: truckId,
        fuel_date: date,
        gallons: parseFloat(numOf(gallons)),
        price_per_gallon: Number(computedPpg!.toFixed(3)),
        odometer_reading: parseInt(numOf(odometer), 10),
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
      setErrs({});
      setShowForm(false);
      await load();
    } catch (err) {
      // Surface the server's specific reason (validation details) rather than a
      // generic "could not save" — a rejected fill-up should say what to fix.
      const data = (
        err as { response?: { data?: { error?: string; details?: string[] } } }
      )?.response?.data;
      const reason = data?.details?.[0] || data?.error;
      setError(
        reason && reason !== "Validation failed"
          ? reason
          : "Couldn't save the fill-up — check your connection and try again.",
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

      <LatestTankCard recap={recap} place={recapPlace} />

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
            stats.avgWeeklyCost90 == null ? "—" : money(stats.avgWeeklyCost90)
          }
        />
        <Kpi
          label="Total gallons"
          value={Math.round(stats.totalGallons).toLocaleString("en-US")}
        />
        <Kpi label="Total spend" value={money(stats.totalSpend)} />
      </div>

      <DieselCompareCard
        national={national}
        yourCostPerGallon={stats.avgCostPerGallon}
      />

      <FuelVsRevenueCard data={fuelRev} />

      {showForm && (
        <Panel className="p-5 mt-4">
          <p className="text-base font-condensed text-light">Log a fill-up</p>
          <p className="text-xs text-muted-text mb-4">
            Vendor &amp; state remember your last stop.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date" error={errs.date}>
              <input
                type="date"
                className={`ds-input ${errs.date ? "ds-input--err" : ""}`}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clr("date");
                }}
              />
            </Field>
            <Field label="Odometer" error={errs.odometer}>
              <AffixInput
                suffix="mi"
                inputMode="numeric"
                placeholder="582,450"
                value={odometer}
                invalid={!!errs.odometer}
                onChange={(e) => {
                  setOdometer(e.target.value);
                  clr("odometer");
                }}
              />
            </Field>
            <Field label="Gallons" error={errs.gallons}>
              <AffixInput
                suffix="gal"
                inputMode="decimal"
                placeholder="137.8"
                value={gallons}
                invalid={!!errs.gallons}
                onChange={(e) => {
                  setGallons(e.target.value);
                  clr("gallons");
                }}
              />
            </Field>
            <Field label="Total paid" error={errs.total}>
              <AffixInput
                prefix="$"
                inputMode="decimal"
                placeholder="555.90"
                value={total}
                invalid={!!errs.total}
                onChange={(e) => {
                  setTotal(e.target.value);
                  clr("total");
                }}
              />
            </Field>
            <div
              className="sm:col-span-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              style={{
                background: ppgOver ? "#331414" : "#12331f",
                border: `1px solid ${ppgOver ? "#5b2020" : "#1f5636"}`,
              }}
            >
              <span className="text-muted-text text-xs">Price / gallon</span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: ppgOver ? "#f0857a" : "#4ade80" }}
              >
                {computedPpg == null ? "—" : `$${computedPpg.toFixed(3)} / gal`}
              </span>
              {ppgOver && (
                <span className="text-[11px] text-[#f0857a]">
                  over the $10 limit — check gallons
                </span>
              )}
            </div>
            <Field label="Vendor">
              <SelectControl
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
              </SelectControl>
              {vendorIsOther && (
                <input
                  className="ds-input mt-1.5"
                  value={company}
                  placeholder="Vendor name"
                  onChange={(e) => setCompany(e.target.value)}
                />
              )}
            </Field>
            {trucks.length > 1 && (
              <Field label="Truck">
                <SelectControl
                  value={truckId}
                  onChange={(e) => setTruckId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {trucks.map((t) => (
                    <option key={t.truck_id} value={t.truck_id}>
                      Unit {t.unit_number}
                    </option>
                  ))}
                </SelectControl>
              </Field>
            )}
            <Field label="City">
              <CityAutocomplete
                value={city}
                onType={setCity}
                onSelect={(c, s) => {
                  setCity(c);
                  setStateCode(s);
                  clr("state");
                }}
                placeholder="City"
                inputClassName="ds-input"
              />
            </Field>
            <Field label="State" hint="· fills from city" error={errs.state}>
              <SelectControl
                value={stateCode}
                invalid={!!errs.state}
                onChange={(e) => {
                  setStateCode(e.target.value);
                  clr("state");
                }}
              >
                <option value="">Select…</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectControl>
            </Field>
          </div>
          <p className="text-[11px] text-muted-text mt-3">
            120+ gallons counts as a full tank; anything less is a partial.
          </p>
          {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          <div className="flex gap-2 mt-5">
            <button
              className="bg-amber text-steel px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              onClick={save}
              disabled={busy}
            >
              {busy ? "Saving…" : "Log fill-up"}
            </button>
            <button
              className="text-muted-text px-4 py-2.5 rounded-lg text-sm border border-steel"
              onClick={() => {
                setShowForm(false);
                setError(null);
                setErrs({});
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
                      {moneyCents(entryCost(e))}
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
