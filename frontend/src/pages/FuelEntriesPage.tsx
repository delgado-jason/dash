import { useEffect, useMemo, useState } from "react";
import type { FuelEntry, NationalDiesel } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import {
  getFuelEntries,
  createFuelEntry,
  deleteFuelEntry,
  updateFuelEntry,
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
import { SidebarTrigger } from "@/components/ui/sidebar";
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
  const [editingId, setEditingId] = useState<string | null>(null);
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
    () => fuelVsRevenue(entries, loads, stats.avgMpg),
    [entries, loads, stats.avgMpg],
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

  // Fuel by state — the IFTA numbers. "--" is the import's unknown-state
  // placeholder; those gallons ride an honest unassigned line instead.
  const byState = useMemo(() => {
    const m = new Map<string, { fills: number; gal: number; spend: number }>();
    let unassigned = { fills: 0, gal: 0, spend: 0 };
    for (const e of entries) {
      const st = e.fuel_state && e.fuel_state !== "--" ? e.fuel_state : null;
      const bucket = st ? (m.get(st) ?? { fills: 0, gal: 0, spend: 0 }) : unassigned;
      bucket.fills++;
      bucket.gal += e.gallons;
      bucket.spend += entryCost(e);
      if (st) m.set(st, bucket);
      else unassigned = bucket;
    }
    const states = [...m.entries()]
      .map(([st, v]) => ({ st, ...v }))
      .sort((a, b) => b.gal - a.gal);
    return { states, unassigned, maxGal: Math.max(1, ...states.map((r) => r.gal)) };
  }, [entries]);

  const resetFields = () => {
    setDate("");
    setOdometer("");
    setGallons("");
    setTotal("");
    setCity("");
    setErrs({});
    setError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    resetFields();
    setShowForm(true);
  };

  // Tap a log row to edit it — how the stateless imports get filed.
  const openEdit = (e: FuelEntry) => {
    setEditingId(e.fuel_entry_id);
    setDate(e.fuel_date);
    setOdometer(String(e.odometer_reading));
    setGallons(String(e.gallons));
    setTotal(entryCost(e).toFixed(2));
    setCompany(e.company_name ?? "");
    setVendorIsOther(
      !!e.company_name &&
        !(FUEL_VENDORS as readonly string[]).includes(e.company_name),
    );
    setCity(e.fuel_city && e.fuel_city !== "--" ? e.fuel_city : "");
    setStateCode(e.fuel_state && e.fuel_state !== "--" ? e.fuel_state : "");
    setErrs({});
    setError(null);
    setShowForm(true);
  };

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
      const payload = {
        truck_id: truckId,
        fuel_date: date,
        gallons: parseFloat(numOf(gallons)),
        price_per_gallon: Number(computedPpg!.toFixed(3)),
        odometer_reading: parseInt(numOf(odometer), 10),
        company_name: company.trim() || null,
        fuel_city: city.trim() || null,
        fuel_state: stateCode.trim().toUpperCase(),
      };
      if (editingId) await updateFuelEntry(editingId, payload);
      else await createFuelEntry(payload);
      // Remember vendor + state for the next fill (kept, not cleared).
      if (company.trim()) localStorage.setItem(LS_VENDOR, company.trim());
      localStorage.setItem(LS_STATE, stateCode.trim().toUpperCase());
      resetFields();
      setShowForm(false);
      setEditingId(null);
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

  const realStates = byState.states.length;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">FUEL</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the tanks and the burn
            {truck ? ` · unit ${truck.unit_number}` : ""}
          </span>
          <span className="flex-1" />
          <button
            onClick={openCreate}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow:
                "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
            }}
          >
            + LOG FILL-UP
          </button>
        </div>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums">
            {entries.length} FILL{entries.length === 1 ? "" : "S"}
          </span>
          <span className="text-[13.5px] text-faint">
            · <b className="font-semibold text-ink tabular-nums">{Math.round(stats.totalGallons).toLocaleString("en-US")} gal</b>
            {" "}· <b className="font-semibold text-ink tabular-nums">{money(stats.totalSpend)}</b>
            {stats.avgCostPerGallon != null && (
              <> · <b className="font-semibold text-ink tabular-nums">${stats.avgCostPerGallon.toFixed(2)}</b>/gal avg</>
            )}
            {stats.avgMpg != null && (
              <> · <b className="font-semibold text-ink tabular-nums">{stats.avgMpg.toFixed(1)}</b> MPG avg</>
            )}
            {stats.costPerMile90 != null && (
              <> · <b className="font-semibold text-ink tabular-nums">${stats.costPerMile90.toFixed(2)}</b>/mi · 90-day</>
            )}
            {realStates > 0 && <> · <b className="font-semibold text-ink">{realStates}</b> states</>}
          </span>
        </div>

        <LatestTankCard recap={recap} place={recapPlace} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <MpgChart windows={stats.windows} />
          <DieselPriceChart data={dieselData} />
        </div>

        <DieselCompareCard
          national={national}
          yourCostPerGallon={stats.avgCostPerGallon}
        />

        <FuelVsRevenueCard data={fuelRev} />

        {/* fuel by state — the IFTA strip */}
        {(byState.states.length > 0 || byState.unassigned.fills > 0) && (
          <div className="ds2-board overflow-hidden mt-4">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                Fuel by state
              </span>
              <span className="font-condensed text-[12px] text-faint">
                · the IFTA numbers, ready to re-enter
              </span>
            </div>
            {byState.states.map((r) => (
              <div
                key={r.st}
                className="flex items-center gap-3 px-4 py-[9px] border-t ds2-cell-rule first:border-t-0 font-condensed"
              >
                <span className="font-display text-[17px] tracking-[.05em] w-[40px]">{r.st}</span>
                <span
                  className="flex-1 h-[8px] rounded-[3px] overflow-hidden"
                  style={{ background: "var(--color-well)", boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)" }}
                >
                  <i
                    className="block h-full"
                    style={{ width: `${(r.gal / byState.maxGal) * 100}%`, background: "#c87f0a" }}
                  />
                </span>
                <span className="w-[130px] text-right text-[13px] text-dim tabular-nums">
                  {r.fills} fill{r.fills === 1 ? "" : "s"} · {Math.round(r.gal)} gal
                </span>
                <span className="w-[80px] text-right font-semibold text-[13.5px] tabular-nums">
                  {money(r.spend)}
                </span>
              </div>
            ))}
            {byState.unassigned.fills > 0 && (
              <div className="px-4 py-[10px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
                <b className="text-dim font-semibold">
                  {byState.unassigned.fills} fills unassigned — {Math.round(byState.unassigned.gal)} gal ·{" "}
                  {money(byState.unassigned.spend)}
                </b>{" "}
                — the old import carried no state. Tap those rows in the log to file
                them; this line burns down as you do.
              </div>
            )}
          </div>
        )}

        {/* the log */}
        <div className="ds2-board overflow-hidden mt-4">
          <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
            <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
              The log
            </span>
            <span className="font-condensed text-[12px] text-faint">
              · FULL closes a tank and stamps its MPG · tap a row to edit
            </span>
          </div>
          {loading ? (
            <p className="font-condensed text-[13px] text-faint px-4 py-3">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="font-condensed text-[13px] text-faint px-4 py-3">
              No fill-ups yet — log your first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                {rows.map((e) => {
                  const full = isFull(e);
                  const mpg = mpgByOdo.get(e.odometer_reading);
                  const pl = [e.fuel_city, e.fuel_state]
                    .filter((x) => x && x !== "--")
                    .join(", ");
                  return (
                    <div
                      key={e.fuel_entry_id}
                      onClick={() => openEdit(e)}
                      className="grid grid-cols-[84px_1fr_150px_70px_80px_90px_30px] gap-[10px] items-baseline px-4 py-[10px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[13.5px] text-dim cursor-pointer hover:bg-well/60"
                    >
                      <span className="text-faint whitespace-nowrap">{fmtDate(e.fuel_date)}</span>
                      <span className="min-w-0 truncate text-ink">
                        {e.company_name || "—"}
                        {pl ? ` · ${pl}` : ""}
                        {full && mpg != null && (
                          <span className="ml-2 font-display text-[11px] tracking-[.1em] text-[#6fd08c] border border-[rgba(111,208,140,.4)] rounded-[4px] px-[6px] py-[1px] whitespace-nowrap">
                            CLOSED THE TANK · {mpg.toFixed(1)} MPG
                          </span>
                        )}
                      </span>
                      <span className="text-right tabular-nums whitespace-nowrap">
                        {full ? (
                          <span className="font-bold text-[10.5px] tracking-[.1em] px-[6px] py-[1px] rounded-[4px] text-amber-hi border border-[rgba(232,148,10,.4)] bg-[rgba(232,148,10,.07)] mr-1.5">
                            FULL
                          </span>
                        ) : (
                          <span className="font-semibold text-[10.5px] tracking-[.08em] px-[6px] py-[1px] rounded-[4px] text-faint border border-dashed border-hairline mr-1.5">
                            PARTIAL
                          </span>
                        )}
                        {e.gallons.toFixed(1)}
                      </span>
                      <span className="text-right tabular-nums">${e.price_per_gallon.toFixed(3)}</span>
                      <span className="text-right font-semibold text-ink tabular-nums">
                        {moneyCents(entryCost(e))}
                      </span>
                      <span className="text-right tabular-nums text-faint">
                        {e.odometer_reading.toLocaleString("en-US")}
                      </span>
                      <button
                        aria-label="Delete"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          remove(e.fuel_entry_id);
                        }}
                        className="text-right text-faint hover:text-[#e05252] text-[13px]"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* the popup — create and edit, one forged modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setError(null);
                setErrs({});
              }}
            />
            <div className="relative w-full max-w-[600px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div
                className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
              >
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>
                  {editingId ? "EDIT FILL-UP" : "LOG FILL-UP"}
                </span>
                <span className="font-condensed text-[11px] text-faint tracking-[.08em] uppercase">
                  vendor &amp; state remember your last stop
                </span>
                <button
                  className="ml-auto text-faint hover:text-ink"
                  aria-label="Close"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setError(null);
                    setErrs({});
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="p-5">
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
                <p className="font-condensed text-[11.5px] text-faint mt-3">
                  {computedPpg != null && !ppgOver
                    ? g >= 120
                      ? "FULL — this clears your 120-gal line; the fill will close a tank."
                      : "PARTIAL — under 120 gal; it rides into the next full's window."
                    : "120+ gallons counts as a full tank; anything less is a partial."}
                </p>
                {error && <p className="text-destructive text-sm mt-2">{error}</p>}
                <div className="flex gap-2 justify-end mt-5">
                  <button
                    className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setError(null);
                      setErrs({});
                    }}
                  >
                    CANCEL
                  </button>
                  <button
                    className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
                    style={{
                      background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                    }}
                    onClick={save}
                    disabled={busy}
                  >
                    {busy ? "SAVING…" : editingId ? "SAVE CHANGES" : "SAVE FILL-UP"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FuelEntriesPage;
