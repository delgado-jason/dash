import { useEffect, useMemo, useState } from "react";
import { localToday, localDayKey } from "@/lib/metrics/today";
import type { FuelEntry, FuelKind, NationalDiesel } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import type { ExpensePeriod } from "@/types/expense";
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
import { getAllSettlementLines } from "@/services/settlementsService";
import { getExpensePeriods } from "@/services/expensesService";
import {
  fuelStats,
  dieselChartData,
  priceVsNational,
  latestTankRecap,
  isFull,
  isDef,
  entryCost,
  lastReading,
  lastApuReading,
} from "@/lib/metrics/fuelEconomy";
import { fuelVsRevenue } from "@/lib/metrics/fuelRevenue";
import { canonicalVendor, vendorLines } from "@/lib/metrics/fuelVendors";
import { fuelBooksVsLog } from "@/lib/metrics/fuelBooks";
import { fuelTaxByMonth, type FuelTaxMonth } from "@/lib/metrics/fuelTax";
import { getFscSchedules } from "@/services/fscScheduleService";
import { getFscScalePoints } from "@/services/fscScalePointService";
import type { FscScalePoint } from "@/types/fscScalePoint";
import type { FscSchedule } from "@/types/fscSchedule";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { useLoads } from "@/hooks/useLoads";
import { FUEL_VENDORS, OTHER_VENDOR, US_STATES } from "@/lib/constants/fuel";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MoneyCard } from "@/components/fuel/MoneyCard";
import { TanksCard } from "@/components/fuel/TanksCard";
import { WhereYouBuy, type StateRow, type Unassigned } from "@/components/fuel/WhereYouBuy";
import { BooksVsLogStrip } from "@/components/fuel/BooksVsLogStrip";
import { PartHeader } from "@/components/fuel/PartHeader";
import { money, moneyCents } from "@/lib/format";
import CityAutocomplete from "@/components/CityAutocomplete";
import { Field, AffixInput, SelectControl } from "@/components/ui/FormControls";

// "Nov 14" — the year only when it is not this one; the odometer orders the log.
const fmtDay = (d: string, thisYear: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.slice(0, 4) === thisYear ? {} : { year: "2-digit" }),
    timeZone: "UTC",
  });

// Strip commas / $ / spaces so "1,378" or "$555.90" parse cleanly (mobile
// keyboards and habit add them; parseFloat/parseInt otherwise truncate).
const numOf = (s: string) => s.replace(/[$,\s]/g, "");

// Remember the last vendor + state so the next fill-up defaults to them.
const LS_VENDOR = "dash.fuel.lastVendor";
const LS_STATE = "dash.fuel.lastState";

// The Fuel page (the Redesign, phase C — the Fuel page sheet, nodded
// 2026-11-15). Five parts in the order the money reads: 01 the money (is the
// surcharge paying for the fuel), 02 the tanks, 03 where you buy, 04 the books
// vs the log, 05 the log. The engines are untouched; this page says what they
// read, as numbers, with no stamp.
const FuelEntriesPage = () => {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const { loads } = useLoads(0);
  const [national, setNational] = useState<NationalDiesel | null>(null);
  const [nationalSeries, setNationalSeries] = useState<NationalDieselMonth[]>([]);
  const [fscSchedules, setFscSchedules] = useState<FscSchedule[] | null>(null);
  const [fscFailed, setFscFailed] = useState(false);
  const [scalePoints, setScalePoints] = useState<FscScalePoint[] | null>(null);
  const [scaleFailed, setScaleFailed] = useState(false);
  // Landstar's FUEL TAX lines, read from the settlements already imported.
  const [fuelTax, setFuelTax] = useState<FuelTaxMonth[] | null>(null);
  const [taxFailed, setTaxFailed] = useState(false);
  // The P&L months — the books beside the log.
  const [periods, setPeriods] = useState<ExpensePeriod[] | null>(null);
  const [periodsFailed, setPeriodsFailed] = useState(false);
  const [filledToTop, setFilledToTop] = useState(true); // filling up is the rule
  const [kind, setKind] = useState<FuelKind>("diesel");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const [truckId, setTruckId] = useState("");
  // The date is today unless you change it — the pump is where this is typed.
  const [date, setDate] = useState(() => localDayKey(new Date()));
  const [odometer, setOdometer] = useState("");
  // Optional APU hour-meter reading. He is standing at the truck with the meter
  // in front of him; one box re-anchors the whole APU schedule.
  const [apuHours, setApuHours] = useState("");
  const [gallons, setGallons] = useState("");
  const [total, setTotal] = useState("");
  // Vendor + state default to your last fill-up (remembered across reloads), so
  // logging a stop is a couple taps and the fields stop coming up blank.
  const [company, setCompany] = useState(() => localStorage.getItem(LS_VENDOR) || "");
  const [vendorIsOther, setVendorIsOther] = useState(
    () =>
      !!localStorage.getItem(LS_VENDOR) &&
      !FUEL_VENDORS.includes((localStorage.getItem(LS_VENDOR) || "") as (typeof FUEL_VENDORS)[number]),
  );
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState(() => localStorage.getItem(LS_STATE) || "");

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

  // Landstar's surcharge tables — the par the money part grades against. A
  // failed fetch is named on the page, never an estimate in disguise.
  useEffect(() => {
    getFscSchedules()
      .then(setFscSchedules)
      .catch(() => setFscFailed(true));
    getFscScalePoints()
      .then(setScalePoints)
      .catch(() => setScaleFailed(true));
  }, []);

  const retryFsc = () => {
    setFscFailed(false);
    getFscSchedules()
      .then(setFscSchedules)
      .catch(() => setFscFailed(true));
  };

  const retryScale = () => {
    setScaleFailed(false);
    getFscScalePoints()
      .then(setScalePoints)
      .catch(() => setScaleFailed(true));
  };

  // The fuel-tax line and the books — both named when they fail to land.
  const loadTax = () => {
    setTaxFailed(false);
    getAllSettlementLines()
      .then((lines) => setFuelTax(fuelTaxByMonth(lines)))
      .catch(() => setTaxFailed(true));
  };
  const loadPeriods = () => {
    setPeriodsFailed(false);
    getExpensePeriods()
      .then(setPeriods)
      .catch(() => setPeriodsFailed(true));
  };
  useEffect(() => {
    loadTax();
    loadPeriods();
  }, []);

  // The clock is read INSIDE the memo: a `now` from the render body would be a
  // new Date every render, so listing it as a dependency would recompute the
  // tank windows on every keystroke. Same numbers, one less trap.
  const stats = useMemo(() => fuelStats(entries, localToday()), [entries]);
  // The latest completed tank, read against his history (the last-tank sentence).
  const recap = useMemo(() => latestTankRecap(stats, nationalSeries), [stats, nationalSeries]);
  // Where that tank closed — the city/state on its closing fill-up.
  const recapPlace = useMemo(() => {
    if (!recap) return null;
    const closing = entries.find((e) => e.odometer_reading === recap.tank.toOdometer);
    if (!closing) return null;
    // "--" is the import placeholder for an unknown state — treat it as blank.
    const parts = [closing.fuel_city, closing.fuel_state].filter((p) => p && p !== "--");
    return parts.join(", ") || null;
  }, [recap, entries]);
  const fuelRev = useMemo(
    () =>
      fuelVsRevenue(
        entries,
        loads,
        stats.avgMpg,
        new Date(),
        fscFailed || scaleFailed
          ? null
          : {
              schedules: fscSchedules ?? [],
              points: scalePoints ?? [],
              dieselByMonth: new Map(nationalSeries.map((m) => [m.month, m.value])),
              latestDiesel: national ? { price: national.value, period: national.period } : null,
            },
      ),
    [entries, loads, stats.avgMpg, fscSchedules, fscFailed, scalePoints, scaleFailed, nationalSeries, national],
  );
  const dieselData = useMemo(() => dieselChartData(entries, nationalSeries), [entries, nationalSeries]);
  const priceRows = useMemo(() => priceVsNational(entries, nationalSeries), [entries, nationalSeries]);
  const vendors = useMemo(() => vendorLines(entries), [entries]);
  const books = useMemo(() => fuelBooksVsLog(entries, periods ?? [], localToday()), [entries, periods]);
  // Per-full MPG, keyed by the closing odometer of each window.
  const mpgByOdo = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of stats.windows) m.set(w.toOdometer, w.mpg);
    return m;
  }, [stats]);

  const rows = useMemo(() => [...entries].sort((a, b) => b.odometer_reading - a.odometer_reading), [entries]);

  // Diesel by state — what Landstar's fuel tax is figured from. "--" is the
  // import's unknown-state placeholder; those gallons ride one named line with
  // their span. DEF is not taxed by the mile and stays out.
  const byState = useMemo(() => {
    const m = new Map<string, StateRow>();
    const unassigned: Unassigned = { fills: 0, gal: 0, spend: 0, from: null, to: null };
    for (const e of entries) {
      if (isDef(e)) continue;
      const st = e.fuel_state && e.fuel_state !== "--" ? e.fuel_state : null;
      if (st) {
        const b = m.get(st) ?? { st, fills: 0, gal: 0, spend: 0 };
        b.fills++;
        b.gal += e.gallons;
        b.spend += entryCost(e);
        m.set(st, b);
      } else {
        unassigned.fills++;
        unassigned.gal += e.gallons;
        unassigned.spend += entryCost(e);
        const d = e.fuel_date.slice(0, 10);
        if (unassigned.from == null || d < unassigned.from) unassigned.from = d;
        if (unassigned.to == null || d > unassigned.to) unassigned.to = d;
      }
    }
    return { states: [...m.values()].sort((a, b) => b.gal - a.gal), unassigned };
  }, [entries]);

  const logFrom = useMemo(
    () => entries.reduce<string | null>((m, e) => (m == null || e.fuel_date < m ? e.fuel_date.slice(0, 10) : m), null),
    [entries],
  );
  const last = useMemo(() => lastReading(entries), [entries]);
  const lastApu = useMemo(() => lastApuReading(entries), [entries]);

  const todayKey = localDayKey(new Date());
  const thisYear = todayKey.slice(0, 4);
  // One national price on the screen: the EIA's figure for this month, the
  // same one the you-vs-national table prints; this week's number only when
  // the month has none yet.
  const nationalNow = nationalSeries.find((m) => m.month === todayKey.slice(0, 7))?.value ?? national?.value ?? null;
  const underNational = stats.paidPerGallon30 != null && nationalNow != null ? nationalNow - stats.paidPerGallon30 : null;

  const resetFields = () => {
    setDate(localDayKey(new Date()));
    setOdometer("");
    setApuHours("");
    setGallons("");
    setTotal("");
    setCity("");
    setKind("diesel");
    setFilledToTop(true);
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
    setApuHours(e.apu_hours == null ? "" : String(e.apu_hours));
    setGallons(String(e.gallons));
    setTotal(entryCost(e).toFixed(2));
    setCompany(e.company_name ?? "");
    setVendorIsOther(!!e.company_name && !(FUEL_VENDORS as readonly string[]).includes(e.company_name));
    setCity(e.fuel_city && e.fuel_city !== "--" ? e.fuel_city : "");
    setStateCode(e.fuel_state && e.fuel_state !== "--" ? e.fuel_state : "");
    setKind(e.kind === "def" ? "def" : "diesel");
    setFilledToTop(e.filled_to_top);
    setErrs({});
    setError(null);
    setShowForm(true);
  };

  // Price/gallon is derived from the total paid ÷ gallons — the numbers on the
  // receipt — rounded to the 3-decimal cents diesel is quoted in.
  const g = parseFloat(numOf(gallons));
  const t = parseFloat(numOf(total));
  const computedPpg = g > 0 && t > 0 && isFinite(g) && isFinite(t) ? t / g : null;
  const ppgOver = computedPpg != null && computedPpg > 10;

  // Clear a field's error the moment the user edits it.
  const clr = (k: string) => setErrs((p) => (p[k] ? { ...p, [k]: "" } : p));

  // Field-level validation mirroring the server rules, so a bad value is caught
  // inline (named on the field) before it ever hits the network.
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!date) e.date = "Pick a date.";
    const od = parseInt(numOf(odometer), 10);
    if (!odometer.trim()) e.odometer = "Required.";
    else if (!Number.isInteger(od) || od < 1 || od > 5_000_000) e.odometer = "Enter a whole number up to 5,000,000.";
    if (apuHours.trim()) {
      const h = parseInt(numOf(apuHours), 10);
      if (!Number.isInteger(h) || h < 0 || h > 100_000) e.apuHours = "Whole hours, 0 to 100,000.";
    }
    if (!gallons.trim()) e.gallons = "Required.";
    else if (!(g >= 1 && g <= 400)) e.gallons = "Must be between 1 and 400 gal.";
    if (!total.trim()) e.total = "Required.";
    else if (ppgOver) e.total = `That's $${computedPpg!.toFixed(2)}/gal — over the $10 limit. Check gallons.`;
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
      // The vendor fold at the boundary: a typed "Loves" lands as Love's.
      const vendor = canonicalVendor(company);
      const payload = {
        truck_id: truckId,
        fuel_date: date,
        gallons: parseFloat(numOf(gallons)),
        price_per_gallon: Number(computedPpg!.toFixed(3)),
        odometer_reading: parseInt(numOf(odometer), 10),
        // Blank stays null — a reading nobody took is not a zero.
        apu_hours: apuHours.trim() ? parseInt(numOf(apuHours), 10) : null,
        company_name: vendor,
        fuel_city: city.trim() || null,
        fuel_state: stateCode.trim().toUpperCase(),
        kind,
        // A DEF fill never closes a tank, whatever the tick remembers.
        filled_to_top: kind === "def" ? false : filledToTop,
      };
      if (editingId) await updateFuelEntry(editingId, payload);
      else await createFuelEntry(payload);
      // Remember vendor + state for the next fill (kept, not cleared).
      if (vendor) localStorage.setItem(LS_VENDOR, vendor);
      localStorage.setItem(LS_STATE, stateCode.trim().toUpperCase());
      resetFields();
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      // Surface the server's specific reason (validation details) rather than a
      // generic "could not save" — a rejected fill-up should say what to fix.
      const data = (err as { response?: { data?: { error?: string; details?: string[] } } })?.response?.data;
      const reason = data?.details?.[0] || data?.error;
      setError(reason && reason !== "Validation failed" ? reason : "Couldn't save the fill-up — check your connection and try again.");
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
  const rememberedVendor = localStorage.getItem(LS_VENDOR) || "";
  const rememberedState = localStorage.getItem(LS_STATE) || "";
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError(null);
    setErrs({});
  };

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">FUEL</h1>
          <span className="font-condensed font-medium text-[16px] text-dim">
            the tanks and the burn
            {truck ? ` · unit ${truck.unit_number}` : ""}
          </span>
          <span className="flex-1" />
          <button
            onClick={openCreate}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[15px] tracking-[.05em] bg-amber text-on-amber"
          >
            + LOG FILL-UP
          </button>
        </div>

        {/* the answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="font-condensed font-semibold text-[22.5px] tabular-nums">
            {stats.entryCount} FILL{stats.entryCount === 1 ? "" : "S"}
          </span>
          <span className="text-[14.5px] text-faint">
            · <b className="font-semibold text-ink tabular-nums">{Math.round(stats.totalGallons).toLocaleString("en-US")} gal</b> ·{" "}
            <b className="font-semibold text-ink tabular-nums">{money(stats.totalSpend)}</b>
            {stats.avgMpg != null && (
              <>
                {" "}
                · <b className="font-semibold text-ink tabular-nums">{stats.avgMpg.toFixed(2)}</b> MPG lifetime
              </>
            )}
            {/* the priced figures ride the last 30 days — diesel moves too fast for a lifetime average to mean anything today */}
            {(stats.costPerMile30 != null || stats.mpg30 != null || stats.paidPerGallon30 != null) && (
              <>
                {" "}
                · last 30 days:
                {stats.costPerMile30 != null && (
                  <>
                    {" "}
                    <b className="font-semibold text-ink tabular-nums">${stats.costPerMile30.toFixed(2)}</b>/mi
                  </>
                )}
                {stats.mpg30 != null && (
                  <>
                    {" "}
                    · <b className="font-semibold text-ink tabular-nums">{stats.mpg30.toFixed(2)}</b> MPG
                  </>
                )}
                {stats.paidPerGallon30 != null && (
                  <>
                    {" "}
                    · <b className="font-semibold text-ink tabular-nums">${stats.paidPerGallon30.toFixed(2)}</b>/gal
                  </>
                )}
                {underNational != null && (
                  <>
                    {" "}
                    ·{" "}
                    <b className={`font-semibold tabular-nums ${underNational >= 0 ? "text-status-positive-text" : "text-status-negative-text"}`}>
                      ${Math.abs(underNational).toFixed(2)}
                    </b>{" "}
                    {underNational >= 0 ? "under" : "over"} the national
                  </>
                )}
              </>
            )}
          </span>
        </div>

        {/* 01 the money */}
        {fscFailed && <FetchFailed what="the surcharge tables" onRetry={retryFsc} className="mt-4" />}
        {scaleFailed && <FetchFailed what="Landstar's weekly scale" onRetry={retryScale} className="mt-4" />}
        <MoneyCard data={fuelRev} parUnavailable={fscFailed || scaleFailed} now={new Date()} />

        {/* 02 the tanks */}
        <TanksCard stats={stats} recap={recap} place={recapPlace} national={nationalSeries} />

        {/* 03 where you buy */}
        <WhereYouBuy
          vendors={vendors}
          priceRows={priceRows}
          chartData={dieselData}
          states={byState.states}
          unassigned={byState.unassigned}
          fuelTax={fuelTax}
          fuelTaxFailed={taxFailed}
          onRetryFuelTax={loadTax}
          logFrom={logFrom}
        />

        {/* 04 the books vs the log */}
        <BooksVsLogStrip rows={books} periodsLoaded={periods != null} periodsFailed={periodsFailed} onRetry={loadPeriods} />

        {/* 05 the log */}
        <div className="ds2-board overflow-hidden mt-4">
          <PartHeader n="05" title="THE LOG" sub="a full fill closes a tank and prints its MPG · tap a row to edit" />
          {loading ? (
            <p className="font-condensed text-[14px] text-faint px-4 py-3">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="font-condensed text-[14px] text-faint px-4 py-3">No fill-ups yet — log your first.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="grid grid-cols-[72px_1fr_60px_64px_72px_80px_90px_52px_28px] gap-[10px] px-4 pt-2 pb-1 font-condensed text-[10.5px] uppercase tracking-[.12em] text-faint">
                  <span>day</span>
                  <span>where</span>
                  <span>kind</span>
                  <span className="text-right">gal</span>
                  <span className="text-right">$/gal</span>
                  <span className="text-right">paid</span>
                  <span className="text-right">odometer</span>
                  <span className="text-right">mpg</span>
                  <span />
                </div>
                {rows.map((e) => {
                  const def = isDef(e);
                  const full = isFull(e);
                  const mpg = full ? mpgByOdo.get(e.odometer_reading) : undefined;
                  const pl = [e.fuel_city, e.fuel_state].filter((x) => x && x !== "--").join(", ");
                  return (
                    <div
                      key={e.fuel_entry_id}
                      onClick={() => openEdit(e)}
                      className="grid grid-cols-[72px_1fr_60px_64px_72px_80px_90px_52px_28px] gap-[10px] items-baseline px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[14.5px] text-dim cursor-pointer hover:bg-well/60"
                      data-kind={def ? "def" : full ? "full" : "partial"}
                    >
                      <span className="text-faint whitespace-nowrap">{fmtDay(e.fuel_date, thisYear)}</span>
                      <span className="min-w-0 truncate text-ink">
                        {e.company_name || "—"}
                        {pl ? ` · ${pl}` : ""}
                      </span>
                      <span className={def ? "text-dim" : full ? "text-ink" : "text-faint"}>{def ? "DEF" : full ? "full" : "partial"}</span>
                      <span className="text-right tabular-nums">{e.gallons.toFixed(1)}</span>
                      <span className="text-right tabular-nums">${e.price_per_gallon.toFixed(3)}</span>
                      <span className="text-right font-semibold text-ink tabular-nums">{moneyCents(entryCost(e))}</span>
                      <span className="text-right tabular-nums text-faint">{e.odometer_reading.toLocaleString("en-US")}</span>
                      <span className={`text-right tabular-nums ${mpg != null ? "text-ink" : "text-faint"}`}>{mpg != null ? mpg.toFixed(2) : "—"}</span>
                      <button
                        aria-label="Delete"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          remove(e.fuel_entry_id);
                        }}
                        className="text-right text-faint hover:text-status-negative-text text-[14px]"
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

        {/* the popup — create and edit, one modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={closeForm} />
            <div className="relative w-full max-w-[600px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[16px] tracking-[.1em] uppercase">{editingId ? "EDIT FILL-UP" : "LOG FILL-UP"}</span>
                <span className="font-condensed text-[12px] text-faint tracking-[.08em] uppercase">vendor &amp; state remember your last stop</span>
                <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={closeForm}>
                  ✕
                </button>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Date" hint={date === todayKey ? "· today" : undefined} error={errs.date}>
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
                  <Field label="Kind" hint="· DEF is never a tank">
                    <div className="flex gap-1.5">
                      {(["diesel", "def"] as FuelKind[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={kind === k}
                          onClick={() => {
                            setKind(k);
                            setFilledToTop(k === "diesel"); // filling up is the rule; a DEF fill never closes a tank
                          }}
                          className={`h-9 flex-1 rounded-[9px] font-condensed font-semibold text-[14px] tracking-[.04em] border ${
                            kind === k ? "bg-amber text-on-amber border-amber" : "bg-well text-dim border-hairline"
                          }`}
                        >
                          {k === "diesel" ? "Diesel" : "DEF"}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Odometer" error={errs.odometer}>
                    <AffixInput
                      suffix="mi"
                      inputMode="numeric"
                      placeholder={last ? `last ${last.odometer.toLocaleString("en-US")} on ${fmtDay(last.date, thisYear)} · type this one` : "582,450"}
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
                      placeholder={kind === "def" ? "2.5" : "137.8"}
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
                      placeholder={kind === "def" ? "14.50" : "555.90"}
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
                      background: ppgOver ? "var(--color-status-negative-bg)" : "var(--color-status-positive-bg)",
                      border: `1px solid ${ppgOver ? "color-mix(in srgb, var(--color-status-negative-text) 35%, transparent)" : "color-mix(in srgb, var(--color-status-positive-text) 35%, transparent)"}`,
                    }}
                  >
                    <span className="text-muted-text text-xs">$/gal from the receipt</span>
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: ppgOver ? "var(--color-status-negative-text)" : "var(--color-status-positive-text)" }}
                    >
                      {computedPpg == null ? "— · total ÷ gallons" : `$${computedPpg.toFixed(3)} at those two`}
                    </span>
                    {ppgOver && <span className="text-[12px] text-status-negative-text">over the $10 limit — check gallons</span>}
                  </div>
                  <Field label="Vendor" hint={!editingId && company && company === rememberedVendor ? "· your last" : undefined}>
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
                      <input className="ds-input mt-1.5" value={company} placeholder="Vendor name" onChange={(e) => setCompany(e.target.value)} />
                    )}
                  </Field>
                  <Field
                    label="APU hours"
                    hint={lastApu ? `· optional · last ${lastApu.hours.toLocaleString("en-US")} on ${fmtDay(lastApu.date, thisYear)}` : "· optional"}
                    error={errs.apuHours}
                  >
                    <AffixInput
                      suffix="hrs"
                      inputMode="numeric"
                      placeholder={lastApu ? lastApu.hours.toLocaleString("en-US") : "1,240"}
                      value={apuHours}
                      invalid={!!errs.apuHours}
                      onChange={(e) => {
                        setApuHours(e.target.value);
                        clr("apuHours");
                      }}
                    />
                    <p className="font-condensed text-[12px] text-faint mt-1">meter reading — keeps the APU schedule honest</p>
                  </Field>
                  {trucks.length > 1 && (
                    <Field label="Truck">
                      <SelectControl value={truckId} onChange={(e) => setTruckId(e.target.value)}>
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
                  <Field
                    label="State"
                    hint={!editingId && stateCode && stateCode === rememberedState ? "· your last · fills from city" : "· fills from city"}
                    error={errs.state}
                  >
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
                {kind === "diesel" ? (
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input type="checkbox" checked={filledToTop} onChange={(ev) => setFilledToTop(ev.target.checked)} />
                    <span className="font-condensed text-[14px] text-ink">Filled to the top</span>
                    <span className="font-condensed text-[12.5px] text-faint">untick a partial — only a full fill closes a tank window</span>
                  </label>
                ) : (
                  <p className="font-condensed text-[12.5px] text-faint mt-3">
                    a DEF fill carries its gallons and total, never a tank window — it is out of MPG and in the cost per mile
                  </p>
                )}
                {error && <p className="text-destructive text-sm mt-2">{error}</p>}
                <div className="flex gap-2 justify-end mt-5">
                  <button
                    className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[14.5px] text-dim bg-well border border-hairline"
                    onClick={closeForm}
                  >
                    CANCEL
                  </button>
                  <button
                    className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[14.5px] bg-amber text-on-amber disabled:opacity-50"
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
