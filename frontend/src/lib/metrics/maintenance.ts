import type { MaintenanceItem } from "@/types/maintenance";
import type { Load } from "@/types/load";
import type { Alert } from "@/types/alert";
import { median } from "./stats";

const MS_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;
// "Due soon" = projected to come due within this many days at the current pace.
export const SOON_WITHIN_DAYS = 30;
// Fallback only, for items with no projected date (mileage item, no pace data).
const SOON_FRACTION = 0.85;

export type DueLevel = "overdue" | "soon" | "ok" | "unknown";

export interface Due {
  level: DueLevel;
  dueMiles: number | null;
  milesRemaining: number | null;
  dueDate: string | null; // from the time interval ('YYYY-MM-DD')
  daysRemaining: number | null;
  progress: number | null; // max of mileage/time fraction elapsed (0..1+)
  etaDate: string | null; // effective predicted due date (earliest of the two lenses)
}

// Add whole months to a 'YYYY-MM-DD' date, UTC-safe.
export const addMonths = (iso: string, months: number): string => {
  const d = new Date(iso);
  const r = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()),
  );
  return r.toISOString().slice(0, 10);
};

// When is this item due, and how close? Handles mileage-based, time-based, or
// both (the more-elapsed lens wins). etaDate blends the time interval with a
// mileage projection (miles remaining ÷ your recent miles/month).
export const computeDue = (
  item: MaintenanceItem,
  currentMiles: number | null,
  now: Date,
  milesPerMonth: number | null,
  soonWithinDays: number = SOON_WITHIN_DAYS,
): Due => {
  let mileFrac: number | null = null;
  let dueMiles: number | null = null;
  let milesRemaining: number | null = null;
  if (item.interval_miles && item.last_done_miles != null && currentMiles != null) {
    dueMiles = item.last_done_miles + item.interval_miles;
    milesRemaining = dueMiles - currentMiles;
    mileFrac = (currentMiles - item.last_done_miles) / item.interval_miles;
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

  // Effective due date = whichever lens comes first (time interval, or the
  // mileage projection from recent pace).
  const candidates: string[] = [];
  if (dueDate) candidates.push(dueDate);
  if (milesRemaining != null && milesPerMonth && milesPerMonth > 0) {
    const daysOut = (milesRemaining / milesPerMonth) * DAYS_PER_MONTH;
    candidates.push(new Date(now.getTime() + daysOut * MS_DAY).toISOString().slice(0, 10));
  }
  const etaDate = candidates.length ? candidates.sort()[0] : null;
  const daysToEta =
    etaDate != null ? (new Date(etaDate).getTime() - now.getTime()) / MS_DAY : null;

  const fracs = [mileFrac, timeFrac].filter((f): f is number => f != null);
  const progress = fracs.length ? Math.max(...fracs) : null;

  // Overdue if past either threshold. Otherwise "soon" when the projected date
  // is within the item's own warning lead (falls back to % elapsed with no
  // projection). Per-item lead lets a truck wash warn at 2 weeks while a DOT
  // inspection warns at 30 days.
  const lead = item.warn_lead_days ?? soonWithinDays;
  let level: DueLevel = "unknown";
  if (progress != null) {
    const past =
      (milesRemaining != null && milesRemaining < 0) ||
      (daysRemaining != null && daysRemaining < 0) ||
      progress >= 1;
    const soon = daysToEta != null ? daysToEta <= lead : progress >= SOON_FRACTION;
    level = past ? "overdue" : soon ? "soon" : "ok";
  }

  return { level, dueMiles, milesRemaining, dueDate, daysRemaining, progress, etaDate };
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
export const maintenanceAlerts = (
  items: MaintenanceItem[],
  currentMiles: Record<string, number | null>,
  now: Date,
  milesPerMonth: number | null,
): Alert[] => {
  const ranked: { alert: Alert; rank: number }[] = [];
  for (const it of items) {
    if (!it.active) continue;
    const due = computeDue(it, currentMiles[it.unit] ?? null, now, milesPerMonth);
    if (due.level !== "overdue" && due.level !== "soon") continue;

    let suffix = "";
    if (due.milesRemaining != null && due.milesRemaining < 0)
      suffix = `${Math.round(-due.milesRemaining).toLocaleString("en-US")} mi over`;
    else if (due.daysRemaining != null && due.daysRemaining < 0)
      suffix = `${Math.round(-due.daysRemaining)} days over`;
    else if (due.milesRemaining != null && due.milesRemaining >= 0)
      suffix = `${Math.round(due.milesRemaining).toLocaleString("en-US")} mi left`;
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
