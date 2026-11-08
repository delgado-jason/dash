// Truck-scoped operating metrics: how hard the truck runs (utilization, miles),
// how thirsty it is (fuel economy, fuel $/mi), how much it earns per mile, and what
// it costs to run ALL-IN (fuel + maintenance + the rig's note per mile — the true
// cost of keeping it rolling). The note is passed in (`assetNote`); callers without
// one get operating cost (fuel + maintenance) only. Pure; take `now` explicitly.
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceService } from "@/types/maintenance";
import type { Truck } from "@/types/truck";
import { loadNetRevenue } from "./rateTargets";
import { fuelStats } from "./fuelEconomy";
import { underLoadDaySet } from "./underLoad";
import { FULL_DEFAULT_SINCE } from "@/lib/perDiem";
import { isDelivered } from "./status";

export interface TruckMetrics {
  utilization: number | null; // under-load days ÷ window days (0..1)
  // Breakdown of the window days so a low utilization is interpretable.
  // underLoad + home + idle = windowDays. Home days count against utilization —
  // this just explains why it wasn't earning (chosen time off vs. no freight).
  windowDays: number; // days since the later of in-service and first logged load
  underLoadDays: number; // days under a load (pickup→delivery spans, deduped)
  homeDays: number; // days marked home and not under load
  idleDays: number; // days with no load and no home mark — the true idle
  avgMpg: number | null;
  bestTank: number | null;
  fuelPerMile: number | null; // fuelStats.costPerMile30 — the app's ONE fuel $/mi
  maintPerMile: number | null; // maintenance $ ÷ driven miles (both full-history)
  revPerMile: number | null;
  costToRunPerMile: number | null; // fuel(30d) + maintenance + note — all-in $/mi
  maintSpend: number; // maintenance $ attributable to the truck
  notePerMile: number | null; // asset note ÷ miles/month (null when no note passed)
  milesPerMonth: number | null;
  totalMiles: number;
  netRevenue: number;
  loads: number;
}

const DAY = 86_400_000;

// Driven miles for a load — the odometer window, else loaded + deadhead.
const loadMiles = (l: Load): number => {
  const odo =
    l.odometer_end != null && l.odometer_start != null
      ? Number(l.odometer_end) - Number(l.odometer_start)
      : 0;
  return odo > 0 ? odo : Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0);
};

// Shop money attributable to the tractor: its own visits, the APU's (the
// TriPac hangs on this truck, its invoices are this truck's shop money) and
// HALF of a visit logged on "both" units — the other half is the trailer's,
// so a shared visit is counted once across the rig (Nod Sheet 2026-11-04, §5
// "Maintenance spend": it used to count in full on both units).
export const truckServiceSpend = (services: MaintenanceService[]): number =>
  services.reduce((sum, s) => {
    const c = Number(s.cost) || 0;
    if (s.unit === "tractor" || s.unit === "apu") return sum + c;
    if (s.unit === "both") return sum + c / 2;
    return sum;
  }, 0);

// ---- utilization: ONE function (2026-11-04, §5) ----
// Days under a load ÷ days in the window, with every window day categorized
// so a low number is interpretable: underLoad + home + idle = windowDays.
// The per-diem default FLIPPED on FULL_DEFAULT_SINCE: before it an unmarked
// day means home; from it on an unmarked day means OUT (idle unless loaded).
// "full"/"half" (travel) days you weren't loaded are idle. An explicit home
// mark wins over a load's date envelope. The Fleet tab and the driver card
// both read this — the card used to run its own loop without the home marks.
export interface UtilizationWindow {
  windowDays: number;
  underLoadDays: number;
  homeDays: number;
  idleDays: number;
  utilization: number | null; // null until the window has a day
}

export const utilizationWindow = (
  loads: Load[],
  windowStart: string | null, // 'YYYY-MM-DD'
  nowDay: string, // the operator's local day key
  homeDays: string[],
  travelDays: string[],
): UtilizationWindow => {
  // The window is half-open, [windowStart, now): 0 on the very first day
  // (windowStart === today), which keeps the per-day loop summing exactly to
  // windowDays. Floor at 0, not 1, so a same-day/future window doesn't claim
  // a phantom day the loop can't fill.
  const windowDays = windowStart
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${nowDay}T00:00:00Z`) - Date.parse(`${windowStart}T00:00:00Z`)) / DAY,
        ),
      )
    : 0;
  const underLoadSet = underLoadDaySet(loads, windowStart, nowDay);
  const homeSet = new Set(homeDays);
  const travelSet = new Set(travelDays);
  let underLoadDays = 0;
  let homeDayCount = 0;
  let idleDays = 0;
  if (windowStart) {
    const cur = new Date(`${windowStart}T00:00:00Z`);
    const end = new Date(`${nowDay}T00:00:00Z`);
    while (cur < end) {
      const k = cur.toISOString().slice(0, 10);
      if (homeSet.has(k)) homeDayCount++;
      else if (underLoadSet.has(k)) underLoadDays++;
      else if (travelSet.has(k)) idleDays++;
      else if (k >= FULL_DEFAULT_SINCE) idleDays++; // unmarked → out, post-flip
      else homeDayCount++; // unmarked → home, pre-flip
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return {
    windowDays,
    underLoadDays,
    homeDays: homeDayCount,
    idleDays,
    utilization: windowDays > 0 ? Math.min(1, underLoadDays / windowDays) : null,
  };
};

export const computeTruckMetrics = (
  truck: Truck,
  truckLoads: Load[],
  truckFuel: FuelEntry[],
  services: MaintenanceService[],
  now: Date,
  homeDays: string[] = [], // explicit per-diem "home" marks ("YYYY-MM-DD")
  travelDays: string[] = [], // per-diem "full"/"half" (on-the-road) marks
  assetNote = 0, // monthly note for this rig (truck + trailer) — folds into cost-to-run
): TruckMetrics => {
  // Earned freight — delivered AND paid — matches the truck's net revenue elsewhere.
  const earned = truckLoads.filter(
    (l) => isDelivered(l) && l.payment_status === "paid",
  );
  // Loads HAULED is delivered (paid or not) — payment status doesn't change
  // whether the truck ran the load.
  const delivered = truckLoads.filter((l) => isDelivered(l));
  const netRevenue = earned.reduce((s, l) => s + loadNetRevenue(l), 0);
  const totalMiles = earned.reduce((s, l) => s + loadMiles(l), 0);

  const fs = fuelStats(truckFuel, now);
  const maintSpend = truckServiceSpend(services);

  // Utilization — days the truck was under a load ÷ days in the window. The window
  // starts at the LATER of the in-service date and the first logged load, so weeks
  // before you were running loads don't read as "idle" — they're unmeasured, not
  // wasted. Days basis (not weeks) so intensity shows: a light week and a heavy one
  // no longer look identical.
  const nowDay = now.toISOString().slice(0, 10);
  const inServiceDay = truck.in_service_date
    ? truck.in_service_date.slice(0, 10)
    : null;
  const firstPickup = truckLoads
    .filter((l) => isDelivered(l) && l.pickup_date)
    .map((l) => l.pickup_date.slice(0, 10))
    .sort()[0];
  const windowStart =
    [inServiceDay, firstPickup].filter((d): d is string => !!d).sort().at(-1) ??
    null;
  const uw = utilizationWindow(truckLoads, windowStart, nowDay, homeDays, travelDays);
  const { windowDays, underLoadDays, idleDays, utilization } = uw;
  const homeDayCount = uw.homeDays;

  // Pace over the OPERATING window (windowStart→now — the same span utilization uses),
  // NOT raw calendar time since the in-service date. Months the truck logged nothing
  // (before dash tracking began, or before its first load) must not dilute the pace:
  // that understates miles/month and inflates note-per-mile → cost-to-run.
  const windowMonths = windowDays / 30.44;
  const milesPerMonth = windowMonths > 0 ? totalMiles / windowMonths : null;

  // All-in cost to run: fuel + maintenance + note. Each component is a valid
  // $/mi on its own honest basis, so they add. Fuel is the 30-day tank-window
  // rate (fs.costPerMile30) — NEVER total fuel spend ÷ total load miles: fuel
  // logging and load history start on different dates, so that mix divides a
  // few months of diesel by a year of driving and understates fuel by half
  // (the $0.31-vs-$0.68 bug, 2026-08-18). Maintenance spreads its full logged
  // history over the miles that history covers — a consistent pair. No recent
  // fuel window → fuel is UNKNOWN, not $0: cost-to-run goes null over lying.
  const notePerMile =
    milesPerMonth && milesPerMonth > 0 && assetNote > 0 ? assetNote / milesPerMonth : null;
  const maintPerMile = totalMiles > 0 ? maintSpend / totalMiles : null;
  const costToRunPerMile =
    fs.costPerMile30 != null && maintPerMile != null
      ? fs.costPerMile30 + maintPerMile + (notePerMile ?? 0)
      : null;

  return {
    utilization,
    windowDays,
    underLoadDays,
    homeDays: homeDayCount,
    idleDays,
    avgMpg: fs.avgMpg,
    bestTank: fs.bestMpg,
    fuelPerMile: fs.costPerMile30,
    maintPerMile,
    revPerMile: totalMiles > 0 ? netRevenue / totalMiles : null,
    costToRunPerMile,
    maintSpend,
    notePerMile,
    milesPerMonth,
    totalMiles,
    netRevenue,
    loads: delivered.length,
  };
};

// One row per truck for the fleet-comparison table (only shown at 2+ trucks).
export interface FleetRow {
  truckId: string;
  unit: string;
  utilization: number | null;
  avgMpg: number | null;
  revPerMile: number | null;
  milesPerMonth: number | null;
}

export const fleetSummary = (
  trucks: Truck[],
  loads: Load[],
  fuel: FuelEntry[],
  services: MaintenanceService[],
  now: Date,
): FleetRow[] =>
  trucks.map((t) => {
    const m = computeTruckMetrics(
      t,
      loads.filter((l) => l.truck_id === t.truck_id),
      fuel.filter((f) => f.truck_id === t.truck_id),
      services,
      now,
    );
    return {
      truckId: t.truck_id,
      unit: t.unit_number,
      utilization: m.utilization,
      avgMpg: m.avgMpg,
      revPerMile: m.revPerMile,
      milesPerMonth: m.milesPerMonth,
    };
  });
