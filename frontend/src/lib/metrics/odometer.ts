// The odometer chain (Cash Board Nod Sheet rev 3, issue 8, nodded 2026-09-30):
// the maintenance accrual runs on EVERY mile the truck rolls — loaded,
// deadhead, and the miles that earn nothing (shop, home, repositioning, the
// trip logs). dash already holds the readings: one at every fill, one at
// every load's pickup and delivery, one at each end of every trip log. A pay
// week's miles are the reading at its end minus the reading at its start,
// where "the reading at a day" is the HIGHEST reading dated on or before it,
// from any source — the odometer never goes backwards, so highest = latest,
// and a same-day pair (a load's start and a fill) resolves by value. A trip
// nobody logged still counts: the delta doesn't care which source pinned it.
// Dates are the #1 bug: every date is sliced to its calendar day.
import type { PayWeek } from "./payWeeks";

export type ReadingSource = "fuel" | "load-start" | "load-end" | "trip-start" | "trip-end" | "service";

export interface OdometerReading {
  date: string; // YYYY-MM-DD
  reading: number;
  source: ReadingSource;
  ref: string; // the load number, trip number, or fill date — for the form's words
}

interface FuelLike {
  fuel_date: string;
  odometer_reading?: number | string | null;
}
interface LoadLike {
  load_number?: string;
  load_status?: string;
  pickup_date: string;
  delivery_date?: string | null;
  odometer_start?: number | string | null;
  odometer_end?: number | string | null;
}
interface TripLike {
  trip_number?: number | string | null;
  trip_date: string;
  status?: string;
  odometer_start?: number | string | null;
  odometer_end?: number | string | null;
}
// A shop visit's reading (maintenance_services.odometer) — the truck's meter
// when unit is the tractor or both; a trailer-only visit reads the hub.
interface ServiceLike {
  service_date: string;
  odometer?: number | string | null;
  unit?: string | null;
}

const day = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);
const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (s: string): Date => new Date(`${day(s)}T00:00:00Z`);
export const addDays = (s: string, n: number): string => {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};

// Every dated reading dash has, sorted by date then value: fills, loads,
// trip logs, shop visits. A cancelled load or trip contributes nothing — its
// readings were never driven.
export const collectReadings = (
  fuel: FuelLike[],
  loads: LoadLike[],
  trips: TripLike[],
  services: ServiceLike[] = [],
): OdometerReading[] => {
  const out: OdometerReading[] = [];
  for (const sv of services) {
    if (sv.unit && sv.unit !== "tractor" && sv.unit !== "both") continue;
    const r = num(sv.odometer);
    const d = day(sv.service_date);
    if (r != null && d) out.push({ date: d, reading: r, source: "service", ref: d });
  }
  for (const f of fuel) {
    const r = num(f.odometer_reading);
    const d = day(f.fuel_date);
    if (r != null && d) out.push({ date: d, reading: r, source: "fuel", ref: d });
  }
  for (const l of loads) {
    if (l.load_status === "cancelled") continue;
    const s = num(l.odometer_start);
    const e = num(l.odometer_end);
    const ref = l.load_number ?? "";
    if (s != null && day(l.pickup_date)) out.push({ date: day(l.pickup_date), reading: s, source: "load-start", ref });
    if (e != null && day(l.delivery_date)) out.push({ date: day(l.delivery_date), reading: e, source: "load-end", ref });
  }
  for (const t of trips) {
    if (t.status === "cancelled") continue;
    const d = day(t.trip_date);
    if (!d) continue;
    const s = num(t.odometer_start);
    const e = num(t.odometer_end);
    const ref = t.trip_number != null ? `trip ${t.trip_number}` : "trip";
    if (s != null) out.push({ date: d, reading: s, source: "trip-start", ref });
    if (e != null) out.push({ date: d, reading: e, source: "trip-end", ref });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.reading - b.reading));
};

// The reading at a day: the highest reading dated on or before it; on a tie
// the later-dated one, so the form names the reading nearest the boundary.
// null when nothing has been logged by then.
export const readingAt = (readings: OdometerReading[], dayKey: string): OdometerReading | null => {
  let best: OdometerReading | null = null;
  for (const r of readings) {
    if (r.date > dayKey) continue;
    if (best == null || r.reading > best.reading || (r.reading === best.reading && r.date > best.date)) best = r;
  }
  return best;
};

// A load's start reading is often the previous load's end, copied — a few
// dozen miles behind the fill in between. That's noise the highest-reading
// rule absorbs. A reading this far BELOW an earlier-dated higher one is a
// typo (a dropped digit, another truck's meter): the higher reading holds
// and the entry is flagged for fixing.
export const BACKWARDS_TOLERANCE_MI = 1000;

// The mirror typo: a reading fat-fingered too HIGH (a doubled or inserted
// digit) never goes backwards, so `backwardsReadings` can't see it — it lands
// as an impossible week. A pay week's delta above this is a typo, not a week:
// the biggest real week on the book is well under it.
export const IMPLAUSIBLE_WEEK_MI = 5000;

export const backwardsReadings = (readings: OdometerReading[]): OdometerReading[] => {
  const out: OdometerReading[] = [];
  let high: OdometerReading | null = null;
  for (const r of readings) {
    if (high != null && r.date > high.date && high.reading - r.reading > BACKWARDS_TOLERANCE_MI) out.push(r);
    if (high == null || r.reading > high.reading) high = r;
  }
  return out;
};

export interface WeekOdometer {
  miles: number | null; // null = no reading before the week — fall back to the loads
  start: OdometerReading | null; // the reading at the day before the week starts
  end: OdometerReading | null; // the reading at the week's last day (or `asOf`, if earlier)
  endSlips: boolean; // the end reading is dated before the boundary — the miles since ride into next week
  backwards: OdometerReading[]; // typos inside the span
}

// A pay week's miles by odometer. For an OPEN week pass `asOf` (today): the
// end reading is the latest one so far and the figure grows as readings land.
export const weekOdometerMiles = (
  readings: OdometerReading[],
  week: PayWeek,
  asOf?: string,
): WeekOdometer => {
  const startDay = addDays(week.start, -1);
  const endDay = asOf && asOf < week.end ? asOf : week.end;
  const start = readingAt(readings, startDay);
  const end = readingAt(readings, endDay);
  const backwards = backwardsReadings(readings).filter((r) => r.date >= week.start && r.date <= endDay);
  if (start == null || end == null) return { miles: null, start, end, endSlips: false, backwards };
  return {
    miles: Math.max(0, end.reading - start.reading),
    start,
    end,
    endSlips: end.date < endDay,
    backwards,
  };
};

// "603,232 on Sep 22 → 605,222 on Sep 29"
export const readingWords = (r: OdometerReading): string =>
  `${Math.round(r.reading).toLocaleString("en-US")} on ${utc(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
