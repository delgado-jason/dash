// The APU's hour meter, projected — decision 10.
//
// The APU has no odometer and nobody reads its meter on a schedule, so its
// hours arrive in rare lumps: a Thermo King invoice, or a box on a fuel-up.
// Between those, the schedule would be blind. So we PROJECT:
//
//     hours today  =  the last reading  +  road days since × this APU's rate
//
// A road day is a day the truck was working — the APU runs on the road and
// sits quiet at the house, which is the same home/away idea the grind meter
// grades a week by. The rate is learned from his own last two readings
// (Δhours ÷ the road days between them); until two readings exist we assume 8
// hours per road day, which is roughly a 10-hour break with the unit running.
//
// Everything the projection produces is MARKED: `estimated` is true the moment
// a road day has passed since the reading, and the UI prints "~" and the date
// it was read on. A number the meter did not give is never drawn as if it did.
import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  keyOf,
  utcDayKey,
  localDayKey,
  daysBetweenKeys,
  DAY_MS,
} from "@/lib/relationships/dayKeys";

// Until two readings teach us better. A TriPac idling through a 10-hour break
// plus a couple of hours at the dock.
export const DEFAULT_APU_HOURS_PER_ROAD_DAY = 8;

// A gap this short between two loads is still the road — he's repositioning or
// waiting on the next pickup, not sitting in the driveway. Anything longer is
// home, and home days add no APU hours.
const BRIDGE_GAP_DAYS = 1;

export interface ApuReading {
  day: string; // 'YYYY-MM-DD' — the day the meter was read
  hours: number;
}

export interface ApuProjection {
  hours: number | null; // null = no reading has ever been taken
  estimated: boolean; // true once a road day has passed since that reading
  readOn: string | null; // the day key of the reading it is anchored to
  rate: number; // hours per road day used (learned, or the default)
  source: "reading" | "projection" | null;
}

const nextDay = (key: string): string =>
  utcDayKey(new Date(Date.parse(`${key}T00:00:00Z`) + DAY_MS));

// A load's span as day keys. A load with no delivery date yet is one day long
// at its pickup — it is on the road today either way.
interface Span {
  start: string;
  end: string;
}

const spansOf = (loads: Load[]): Span[] => {
  const spans: Span[] = [];
  for (const l of loads) {
    if (l.load_status === "cancelled" || !l.pickup_date) continue;
    const start = keyOf(l.pickup_date);
    const end = l.delivery_date ? keyOf(l.delivery_date) : start;
    spans.push({ start, end: end < start ? start : end });
  }
  return spans.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
};

// Merge overlapping spans, and bridge a gap of BRIDGE_GAP_DAYS or less between
// consecutive loads. `daysBetweenKeys` of 2 means exactly one empty day sits in
// between, so that is the widest gap the road swallows.
const mergeSpans = (spans: Span[]): Span[] => {
  const out: Span[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && daysBetweenKeys(last.end, s.start) <= BRIDGE_GAP_DAYS + 1) {
      if (s.end > last.end) last.end = s.end;
    } else out.push({ ...s });
  }
  return out;
};

// How many days in [fromKey, toKey] the truck was on the road. Inclusive of
// both ends; an inverted window is zero days, not a negative count.
export const roadDays = (loads: Load[], fromKey: string, toKey: string): number => {
  if (!fromKey || !toKey || fromKey > toKey) return 0;
  let days = 0;
  for (const s of mergeSpans(spansOf(loads))) {
    const start = s.start > fromKey ? s.start : fromKey;
    const end = s.end < toKey ? s.end : toKey;
    if (start > end) continue;
    days += daysBetweenKeys(start, end) + 1;
  }
  return days;
};

// The road days a stretch of hours was earned over: the days strictly AFTER
// the earlier reading, through the later one. The reading day itself belongs
// to the stretch before it, so no day is ever counted twice.
const roadDaysAfter = (loads: Load[], fromKey: string, toKey: string): number =>
  fromKey >= toKey ? 0 : roadDays(loads, nextDay(fromKey), toKey);

// Every hour-meter reading we hold, oldest first. Two sources, one meter: an
// APU service carries the reading off the invoice, a fuel-up carries the one
// he typed at the pump. Same-day ties keep fuel last — services are filed from
// paperwork days later, the pump reading is taken standing at the truck.
export const apuReadings = (
  services: MaintenanceService[],
  fuelEntries: FuelEntry[],
): ApuReading[] => {
  const rows: (ApuReading & { rank: number })[] = [];
  for (const s of services)
    if (s.unit === "apu" && s.apu_hours != null)
      rows.push({ day: keyOf(s.service_date), hours: Number(s.apu_hours), rank: 0 });
  for (const f of fuelEntries)
    if (f.apu_hours != null)
      rows.push({ day: keyOf(f.fuel_date), hours: Number(f.apu_hours), rank: 1 });
  // Day first, then SOURCE RANK — the tie is decided on purpose, not by the
  // order the two loops happened to push in. On one day the fuel reading wins
  // (rank 1 sorts last, and the projection anchors on the last reading): the
  // service is filed off paperwork days later, the pump number is read standing
  // at the truck.
  return rows
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.rank - b.rank))
    .map(({ day, hours }) => ({ day, hours }));
};

// This APU's own hours per road day, learned from the last two readings that
// sit on DIFFERENT days. A service and a fuel-up on the same afternoon are one
// reading of one meter, not a stretch to learn from — pairing them would give
// zero road days and throw away a rate learned over weeks. So `prev` is the
// newest reading strictly before the last one's day.
// null when it cannot be learned — fewer than two such readings, no road days
// between them, or a meter that went backwards (a replacement or a typo).
export const apuRate = (readings: ApuReading[], loads: Load[]): number | null => {
  if (readings.length < 2) return null;
  const last = readings[readings.length - 1];
  let prev: ApuReading | null = null;
  for (let i = readings.length - 2; i >= 0; i--)
    if (readings[i].day < last.day) {
      prev = readings[i];
      break;
    }
  if (!prev) return null;
  const delta = last.hours - prev.hours;
  if (delta < 0) return null;
  const days = roadDaysAfter(loads, prev.day, last.day);
  if (days <= 0) return null;
  return delta / days;
};

// Where the meter stands today. Anchored on the newest reading and carried
// forward over the road days since it, at this APU's rate.
export const projectApuHours = (
  readings: ApuReading[],
  loads: Load[],
  now: Date,
): ApuProjection => {
  const rate = apuRate(readings, loads) ?? DEFAULT_APU_HOURS_PER_ROAD_DAY;
  const last = readings[readings.length - 1];
  if (!last) return { hours: null, estimated: false, readOn: null, rate, source: null };

  // Today is HIS today. The readings carry DATE columns (utcDayKey/keyOf), but
  // "now" is a wall clock: at 7:30 pm Central toISOString is already tomorrow,
  // which would hand the projection a road day he has not driven yet.
  const days = roadDaysAfter(loads, last.day, localDayKey(now));
  // A meter reads whole hours, so the projection does too.
  const hours = Math.round(last.hours + days * rate);
  return {
    hours,
    estimated: days > 0,
    readOn: last.day,
    rate,
    source: days > 0 ? "projection" : "reading",
  };
};

// What share of recent days were road days — how a count of road days converts
// back into calendar days for an ETA. null when the window holds nothing.
export const roadDayShare = (loads: Load[], now: Date, windowDays = 90): number | null => {
  if (windowDays <= 0) return null;
  // Both ends are his calendar — the window closes on today where he stands,
  // not where UTC already is.
  const to = localDayKey(now);
  const from = localDayKey(new Date(now.getTime() - (windowDays - 1) * DAY_MS));
  const on = roadDays(loads, from, to);
  return on > 0 ? on / windowDays : null;
};

// Everything `computeDue` needs to grade an APU clock, built ONE way. Every
// surface that grades an APU item — the Maintenance page, the dashboard alerts,
// the Fleet tab — reads the same projection from the same two sources, so no
// two screens can disagree about what the meter says.
export interface ApuDueOptions {
  apu: ApuProjection;
  hoursPerRoadDay: number | null; // this APU's rate (learned, or the default)
  roadDayShare: number | null; // road days ÷ calendar days, for the ETA
}

export const apuDueOptions = (
  services: MaintenanceService[],
  fuelEntries: FuelEntry[],
  loads: Load[],
  now: Date,
): ApuDueOptions => {
  const apu = projectApuHours(apuReadings(services, fuelEntries), loads, now);
  return {
    apu,
    hoursPerRoadDay: apu.rate,
    roadDayShare: roadDayShare(loads, now),
  };
};
