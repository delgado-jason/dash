import type { MaintenanceItem, MaintenanceUnit } from "@/types/maintenance";
import type { Load } from "@/types/load";
import type { Alert } from "@/types/alert";
import { median } from "./stats";
import { DEFAULT_APU_HOURS_PER_ROAD_DAY } from "./apuHours";

const MS_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;
// "Due soon" = projected to come due within this many days at the current pace.
export const SOON_WITHIN_DAYS = 30;
// Fallback only, for items with no projected date (mileage item, no pace data).
const SOON_FRACTION = 0.85;

export type DueLevel = "overdue" | "soon" | "ok" | "unknown";

// The three lenses an item can be due through.
export type DueLens = "hours" | "miles" | "months";

// The three lenses an item can be due through. Most items use one or two;
// the most-elapsed lens is the one that decides.
export interface Due {
  level: DueLevel;
  dueMiles: number | null;
  milesRemaining: number | null;
  dueHours: number | null; // the APU hour meter this item comes due at
  hoursRemaining: number | null; // negative = run past it
  dueDate: string | null; // from the time interval ('YYYY-MM-DD')
  daysRemaining: number | null;
  progress: number | null; // max of the mileage/hours/time fractions (0..1+)
  etaDate: string | null; // effective predicted due date (earliest lens)
  // Which lens is the most elapsed — the one that set `level`. The row's right
  // cell prints THIS lens's remaining figure, so an item overdue on months
  // never prints healthy hours in red. null when nothing can be counted.
  decidedBy: DueLens | null;
  // The ETA leaned on a default: an APU rate nobody has taught us yet, or a
  // road-day share the window could not supply. The figure wears a "~".
  etaEstimated: boolean;
}

// What a unit's meter reads right now: miles for the tractor and the trailer,
// projected engine hours for the APU (null until a reading exists).
// One entry per unit, plus one flag: the APU number is a PROJECTION whenever a
// road day has passed since the last reading, and everything derived from it
// wears a "~" — a number the meter did not give is never drawn as if it did.
export type CurrentReading = Record<MaintenanceUnit, number | null> & {
  apuEstimated: boolean;
};

// The hours lens's extra inputs. Separate from the positional arguments so the
// six call sites that only care about miles never have to know about them.
export interface DueOptions {
  currentHours?: number | null; // the APU projection's hours
  hoursPerRoadDay?: number | null; // this APU's learned rate
  roadDayShare?: number | null; // road days ÷ calendar days, for the ETA
  soonWithinDays?: number;
}

// Add whole months to a 'YYYY-MM-DD' date, UTC-safe.
export const addMonths = (iso: string, months: number): string => {
  const d = new Date(iso);
  const r = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()),
  );
  return r.toISOString().slice(0, 10);
};

// When is this item due, and how close? Handles mileage-based, hours-based,
// time-based, or any mix (the more-elapsed lens wins). etaDate blends the time
// interval with a mileage projection (miles remaining ÷ your recent
// miles/month) and an hours projection (hours remaining ÷ this APU's rate, in
// ROAD days, converted back to calendar days at the recent road-day share).
export const computeDue = (
  item: MaintenanceItem,
  currentMiles: number | null,
  now: Date,
  milesPerMonth: number | null,
  opts: DueOptions = {},
): Due => {
  const soonWithinDays = opts.soonWithinDays ?? SOON_WITHIN_DAYS;
  // A lens whose own meter cannot answer BLOCKS the item: nothing else gets to
  // answer in its place. An oil change that runs on hours is not "fine" because
  // the calendar is comfortable — it is unanswered until the meter is read.
  let blocked = false;

  let mileFrac: number | null = null;
  let dueMiles: number | null = null;
  let milesRemaining: number | null = null;
  if (item.interval_miles && item.last_done_miles != null && currentMiles != null) {
    // A reading BELOW the last service is bad data — a swapped meter, a typo,
    // a hub that was replaced. A negative fraction would read as "plenty of
    // room left"; the honest answer is "check the meter".
    if (currentMiles < item.last_done_miles) blocked = true;
    else {
      dueMiles = item.last_done_miles + item.interval_miles;
      milesRemaining = dueMiles - currentMiles;
      mileFrac = (currentMiles - item.last_done_miles) / item.interval_miles;
    }
  }

  // The hours lens. It needs all three — an interval, a baseline the meter
  // gave, and a current reading. Any one missing and the APU item has no
  // baseline; it says so rather than counting from an invented zero, and the
  // months lens does NOT get to answer for it.
  let hoursFrac: number | null = null;
  let dueHours: number | null = null;
  let hoursRemaining: number | null = null;
  const currentHours = opts.currentHours ?? null;
  if (item.interval_hours) {
    if (item.last_done_hours == null || currentHours == null) blocked = true;
    else if (currentHours < item.last_done_hours) blocked = true; // below the baseline
    else {
      dueHours = item.last_done_hours + item.interval_hours;
      hoursRemaining = dueHours - currentHours;
      hoursFrac = (currentHours - item.last_done_hours) / item.interval_hours;
    }
  }

  let timeFrac: number | null = null;
  let dueDate: string | null = null;
  let daysRemaining: number | null = null;
  if (item.interval_months && item.last_done_date) {
    dueDate = addMonths(item.last_done_date, item.interval_months);
    const total = item.interval_months * DAYS_PER_MONTH;
    const elapsed =
      (now.getTime() - new Date(item.last_done_date).getTime()) / MS_DAY;
    timeFrac = elapsed / total;
    daysRemaining = (new Date(dueDate).getTime() - now.getTime()) / MS_DAY;
  }

  // Effective due date = whichever lens comes first (time interval, the
  // mileage projection from recent pace, or the hours projection). Each
  // candidate remembers whether it had to lean on a default.
  const candidates: { date: string; estimated: boolean }[] = [];
  if (dueDate) candidates.push({ date: dueDate, estimated: false });
  if (milesRemaining != null && milesPerMonth && milesPerMonth > 0) {
    const daysOut = (milesRemaining / milesPerMonth) * DAYS_PER_MONTH;
    candidates.push({
      date: new Date(now.getTime() + daysOut * MS_DAY).toISOString().slice(0, 10),
      estimated: false,
    });
  }
  // Hours only accrue on road days, so the hours ETA lands in ROAD days first
  // and is stretched back onto the calendar by the recent road-day share — 40
  // road days at 2 days home a week is not 40 days from now.
  //
  // Two defaults live here, and both make the answer an ESTIMATE rather than a
  // wrong number: with no learned rate we assume DEFAULT_APU_HOURS_PER_ROAD_DAY
  // (8 — a TriPac idling through a 10-hour break), and with no road-day share
  // we treat every calendar day as a road day (share 1), which is the soonest
  // the clock could come due. Both are surfaced as `etaEstimated` so the UI can
  // wear the "~" instead of pretending the date was computed from his numbers.
  const rate = opts.hoursPerRoadDay ?? DEFAULT_APU_HOURS_PER_ROAD_DAY;
  const share = opts.roadDayShare ?? null;
  if (hoursRemaining != null && rate > 0) {
    const roadDaysOut = hoursRemaining / rate;
    const daysOut = share && share > 0 ? roadDaysOut / share : roadDaysOut;
    candidates.push({
      date: new Date(now.getTime() + daysOut * MS_DAY).toISOString().slice(0, 10),
      estimated: opts.hoursPerRoadDay == null || share == null || share <= 0,
    });
  }
  const eta = candidates.length
    ? candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0]
    : null;
  const etaDate = eta?.date ?? null;
  const daysToEta =
    etaDate != null ? (new Date(etaDate).getTime() - now.getTime()) / MS_DAY : null;

  // The most-elapsed lens is the one that decides, and the one the row prints.
  const lenses: [DueLens, number | null][] = [
    ["hours", hoursFrac],
    ["miles", mileFrac],
    ["months", timeFrac],
  ];
  const counted = lenses.filter((l): l is [DueLens, number] => l[1] != null);
  const progress = blocked || !counted.length
    ? null
    : Math.max(...counted.map(([, f]) => f));
  const decidedBy =
    progress == null
      ? null
      : counted.reduce((best, l) => (l[1] > best[1] ? l : best))[0];

  // Overdue if past any threshold. Otherwise "soon" when the projected date
  // is within the item's own warning lead (falls back to % elapsed with no
  // projection). Per-item lead lets a truck wash warn at 2 weeks while a DOT
  // inspection warns at 30 days.
  const lead = item.warn_lead_days ?? soonWithinDays;
  let level: DueLevel = "unknown";
  if (progress != null) {
    const past =
      (milesRemaining != null && milesRemaining < 0) ||
      (hoursRemaining != null && hoursRemaining < 0) ||
      (daysRemaining != null && daysRemaining < 0) ||
      progress >= 1;
    const soon = daysToEta != null ? daysToEta <= lead : progress >= SOON_FRACTION;
    level = past ? "overdue" : soon ? "soon" : "ok";
  }

  return {
    level,
    dueMiles,
    milesRemaining,
    dueHours,
    hoursRemaining,
    dueDate,
    daysRemaining,
    progress,
    etaDate,
    decidedBy,
    etaEstimated: eta?.estimated ?? false,
  };
};

// Highest odometer across any sources that carry one — loads, services, and
// (later) fuel entries. Fuel readings will usually be the freshest.
export const maxOdometer = (
  ...values: (number | null | undefined)[]
): number | null => {
  let max: number | null = null;
  for (const v of values) if (v != null && (max == null || v > max)) max = v;
  return max;
};

// Highest odometer recorded on trips (optionally scoped to one truck). A trip
// carries the tractor's odometer, so a repositioning or home-time move counts
// toward its latest reading just like a load does.
export const maxTripOdometer = (
  trips: { truck_id?: string | null; odometer_end?: number | null }[],
  truckId?: string,
): number | null =>
  maxOdometer(
    ...trips
      .filter((t) => (truckId ? t.truck_id === truckId : true))
      .map((t) => t.odometer_end ?? null),
  );

// Current tractor odometer = the highest odometer reading across loads.
export const currentTractorMiles = (loads: Load[]): number | null => {
  let max: number | null = null;
  for (const l of loads) {
    if (l.odometer_end != null) {
      const v = Number(l.odometer_end);
      if (max == null || v > max) max = v;
    }
  }
  return max;
};

// Recent driving pace (miles/month) that drives the mileage→date projection.
// We bucket delivered miles by calendar month over a recent window, then take
// the MEDIAN of the last few monthly totals — so one anomalous month (a
// breakdown that idles the truck, a monster haul, or the partial current month)
// can't skew the projection the way a mean would. Window is generous (120d) to
// reliably capture ~3 full months.
export const recentMilesPerMonth = (loads: Load[], now: Date): number | null => {
  const cutoff = now.getTime() - 120 * MS_DAY;
  const byMonth = new Map<string, number>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.delivery_date) continue;
    if (new Date(l.delivery_date).getTime() < cutoff) continue;
    if (l.odometer_end == null || l.odometer_start == null) continue;
    const miles = Number(l.odometer_end) - Number(l.odometer_start);
    if (miles <= 0) continue;
    const key = l.delivery_date.slice(0, 7); // YYYY-MM (ISO prefix, UTC-safe)
    byMonth.set(key, (byMonth.get(key) ?? 0) + miles);
  }
  const recent = [...byMonth.keys()]
    .sort()
    .slice(-3)
    .map((k) => byMonth.get(k)!);
  return median(recent);
};

// Overdue / due-soon items → dashboard alerts (overdue = critical, first).
// An APU item alerts off the PROJECTION, exactly like a truck item alerts off
// the odometer — the reading is softer, the clock is not.
export const maintenanceAlerts = (
  items: MaintenanceItem[],
  currentReading: Partial<CurrentReading>,
  now: Date,
  milesPerMonth: number | null,
  hoursOpts: Pick<DueOptions, "hoursPerRoadDay" | "roadDayShare"> = {},
): Alert[] => {
  const ranked: { alert: Alert; rank: number }[] = [];
  for (const it of items) {
    if (!it.active) continue;
    const reading = currentReading[it.unit] ?? null;
    const due = computeDue(it, it.unit === "apu" ? null : reading, now, milesPerMonth, {
      ...hoursOpts,
      currentHours: it.unit === "apu" ? reading : null,
    });
    if (due.level !== "overdue" && due.level !== "soon") continue;
    // Hours off a PROJECTION wear a "~" — the meter gave the anchor, the road
    // days gave the rest, and the banner says so.
    const tilde =
      it.unit === "apu" && currentReading.apuEstimated === true ? "~" : "";

    let suffix = "";
    if (due.milesRemaining != null && due.milesRemaining < 0)
      suffix = `${Math.round(-due.milesRemaining).toLocaleString("en-US")} mi over`;
    else if (due.hoursRemaining != null && due.hoursRemaining < 0)
      suffix = `${tilde}${Math.round(-due.hoursRemaining).toLocaleString("en-US")} hrs over`;
    else if (due.daysRemaining != null && due.daysRemaining < 0)
      suffix = `${Math.round(-due.daysRemaining)} days over`;
    else if (due.milesRemaining != null && due.milesRemaining >= 0)
      suffix = `${Math.round(due.milesRemaining).toLocaleString("en-US")} mi left`;
    else if (due.hoursRemaining != null && due.hoursRemaining >= 0)
      suffix = `${tilde}${Math.round(due.hoursRemaining).toLocaleString("en-US")} hrs left`;
    else if (due.etaDate)
      suffix = `in ${Math.max(0, Math.round((new Date(due.etaDate).getTime() - now.getTime()) / MS_DAY))} days`;

    ranked.push({
      rank: due.level === "overdue" ? 0 : 1,
      alert: {
        id: `maint-${it.item_id}`,
        kind: "maintenance",
        severity: due.level === "overdue" ? "critical" : "warning",
        message: `${it.name} ${due.level === "overdue" ? "overdue" : "due soon"}${suffix ? ` · ${suffix}` : ""}`,
        actionHref: "/maintenance",
      },
    });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.alert);
};

// Overall fleet-upkeep score (0–100) from the schedule's due counts. Overdue
// items count for nothing, due-soon for half; "no baseline" items sit out.
export interface FleetHealth {
  score: number | null; // null when there's nothing to assess
  label: string;
  color: string;
}

export const fleetHealth = (counts: {
  overdue: number;
  soon: number;
  ok: number;
}): FleetHealth => {
  const assessable = counts.overdue + counts.soon + counts.ok;
  if (assessable === 0)
    return { score: null, label: "No data", color: "#9daabb" };
  const score = Math.round(((counts.ok + 0.5 * counts.soon) / assessable) * 100);
  if (score >= 85) return { score, label: "Healthy", color: "#1d9e75" };
  if (score >= 60) return { score, label: "Needs attention", color: "#e8940a" };
  return { score, label: "Rough shape", color: "#e24b4a" };
};
