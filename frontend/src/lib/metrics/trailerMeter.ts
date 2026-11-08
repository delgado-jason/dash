// The truck's odometer is the trailer's meter, by rule (GL-07, Jason
// 2026-11-05: "Yes, truck odometer by rule"; General Items Nod Sheet mock 4,
// call 4 lean A, nodded 2026-11-07). The trailer has no hubodometer. Its
// reading today is the truck's latest reading; a trailer service's reading is
// the truck's last reading on or before the service date. Every reading names
// where it came from, so a number on the trailer page is never a bare figure.
import type { FuelEntry } from "@/types/fuelEntry";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { MaintenanceService } from "@/types/maintenance";
import { isDelivered } from "./status";

export interface MeterReading {
  reading: number; // truck odometer miles
  date: string; // "YYYY-MM-DD" the reading was taken
  source: string; // "the Nov 7 fill" · "load 1572011 delivered Oct 1" · "the Aug 11 trip" · "the Aug 28 service" · "the truck's record"
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// "Nov 7" — month and day, read in UTC so the day never shifts.
export const shortDay = (key: string): string =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Every dated reading of the truck's odometer the app holds: fills, delivered
// loads (both ends), completed trips (both ends), tractor and "both" services.
export const truckReadings = (
  fuel: FuelEntry[],
  loads: Load[],
  trips: Trip[],
  services: MaintenanceService[],
): MeterReading[] => {
  const out: MeterReading[] = [];
  for (const f of fuel) {
    const r = num(f.odometer_reading);
    if (r != null && f.fuel_date) out.push({ reading: r, date: f.fuel_date.slice(0, 10), source: `the ${shortDay(f.fuel_date)} fill` });
  }
  for (const l of loads) {
    if (!isDelivered(l)) continue;
    const end = num(l.odometer_end);
    if (end != null && l.delivery_date)
      out.push({ reading: end, date: l.delivery_date.slice(0, 10), source: `load ${l.load_number} delivered ${shortDay(l.delivery_date)}` });
    const start = num(l.odometer_start);
    if (start != null && l.pickup_date)
      out.push({ reading: start, date: l.pickup_date.slice(0, 10), source: `load ${l.load_number} picked up ${shortDay(l.pickup_date)}` });
  }
  for (const t of trips) {
    if (t.status === "cancelled" || !t.trip_date) continue;
    const end = num(t.odometer_end);
    if (end != null) out.push({ reading: end, date: t.trip_date.slice(0, 10), source: `the ${shortDay(t.trip_date)} trip` });
  }
  for (const s of services) {
    if (s.unit !== "tractor" && s.unit !== "both") continue;
    const r = num(s.odometer);
    if (r != null && s.service_date)
      out.push({ reading: r, date: s.service_date.slice(0, 10), source: `the ${shortDay(s.service_date)} service` });
  }
  return out;
};

// The reading the truck showed on or before `day`: the latest-dated reading up
// to that day, the highest when a day carries several. Null when nothing is
// dated that early — the caller says so, never 0.
export const truckReadingOnOrBefore = (day: string, readings: MeterReading[]): MeterReading | null => {
  let best: MeterReading | null = null;
  for (const r of readings) {
    if (r.date > day) continue;
    if (best == null || r.date > best.date || (r.date === best.date && r.reading > best.reading)) best = r;
  }
  return best;
};

// The trailer's reading today: the truck's highest reading on record — the
// dated readings and the truck record's own odometer (odometers only climb,
// so the highest is the latest). Null with no truck and no readings.
export const trailerReadingToday = (
  truck: { unit_number: string; current_odometer: number | string | null } | null,
  readings: MeterReading[],
): MeterReading | null => {
  let best: MeterReading | null = null;
  for (const r of readings) if (best == null || r.reading > best.reading) best = r;
  const own = truck ? num(truck.current_odometer) : null;
  if (own != null && (best == null || own > best.reading))
    best = { reading: own, date: "", source: `truck ${truck!.unit_number}'s record` };
  return best;
};

// "606,217 · truck 580991 · the Nov 7 fill" — the words under a reading.
export const meterWords = (r: MeterReading | null, truckUnit?: string | null): string => {
  if (r == null) return "no reading yet — log a fill or a load with its odometer";
  const who = truckUnit ? `truck ${truckUnit} · ` : "";
  return `${r.reading.toLocaleString("en-US")} · ${who}${r.source}`;
};
