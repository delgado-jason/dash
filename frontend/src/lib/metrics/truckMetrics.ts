// Truck-scoped operating metrics: how hard the truck runs (utilization, miles),
// how thirsty it is (fuel economy, fuel $/mi), how much it earns per mile, and what
// it costs to run ALL-IN (fuel + maintenance + the rig's note per mile — the true
// cost of keeping it rolling). The note is passed in (`assetNote`); callers without
// one get operating cost (fuel + maintenance) only. Pure; take `now` explicitly.
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceService } from "@/types/maintenance";
import type { Truck } from "@/types/truck";
import { loadRevenue } from "./rateTargets";
import { fuelStats } from "./fuelEconomy";
import { underLoadDaySet } from "./underLoad";

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
  fuelPerMile: number | null;
  revPerMile: number | null;
  costToRunPerMile: number | null; // (fuel + maintenance + note) ÷ miles — all-in
  fuelSpend: number; // fuel $ over the window (for the fuel-vs-maintenance split)
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

// Maintenance services attributable to the tractor (no per-truck link exists yet,
// so tractor + both count; fine for a single truck).
const truckServiceSpend = (services: MaintenanceService[]): number =>
  services
    .filter((s) => s.unit === "tractor" || s.unit === "both")
    .reduce((sum, s) => sum + (Number(s.cost) || 0), 0);

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
    (l) => l.load_status === "delivered" && l.payment_status === "paid",
  );
  // Loads HAULED is delivered (paid or not) — payment status doesn't change
  // whether the truck ran the load.
  const delivered = truckLoads.filter((l) => l.load_status === "delivered");
  const netRevenue = earned.reduce((s, l) => s + loadRevenue(l), 0);
  const totalMiles = earned.reduce((s, l) => s + loadMiles(l), 0);

  const fs = fuelStats(truckFuel, now);
  const fuelSpend = fs.totalSpend;
  const maintSpend = truckServiceSpend(services);

  // Utilization — days the truck was under a load ÷ days in the window. The window
  // starts at the LATER of the in-service date and the first logged load, so weeks
  // before you were running loads don't read as "idle" — they're unmeasured, not
  // wasted. Days basis (not weeks) so intensity shows: a light week and a heavy one
  // no longer look identical.
  const inService = truck.in_service_date
    ? new Date(truck.in_service_date.slice(0, 10) + "T00:00:00Z")
    : null;
  const nowDay = now.toISOString().slice(0, 10);
  const inServiceDay = truck.in_service_date
    ? truck.in_service_date.slice(0, 10)
    : null;
  const firstPickup = truckLoads
    .filter((l) => l.load_status === "delivered" && l.pickup_date)
    .map((l) => l.pickup_date.slice(0, 10))
    .sort()[0];
  const windowStart =
    [inServiceDay, firstPickup].filter((d): d is string => !!d).sort().at(-1) ??
    null;
  // Half-open [windowStart, now) — 0 on the very first day (windowStart === today),
  // which keeps the per-day loop below summing exactly to windowDays. Floor at 0,
  // not 1, so a same-day/future window doesn't claim a phantom day the loop can't fill.
  const windowDays = windowStart
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${nowDay}T00:00:00Z`) -
            Date.parse(`${windowStart}T00:00:00Z`)) /
            DAY,
        ),
      )
    : 0;

  // Categorize every window day. The per-diem default is HOME (an unmarked day
  // means you were home), so home = explicit "home" mark OR unmarked, unless you
  // were under a load. "full"/"half" (travel) days you weren't loaded are idle
  // (out, not earning). An explicit home mark wins over a load's date envelope.
  const underLoadSet = underLoadDaySet(truckLoads, windowStart, nowDay);
  const homeSet = new Set(homeDays);
  const travelSet = new Set(travelDays);
  let underLoadDays = 0;
  let homeDayCount = 0;
  let idleDays = 0;
  if (windowStart) {
    // [windowStart, now) — windowDays days, so the three counts sum to windowDays.
    const cur = new Date(`${windowStart}T00:00:00Z`);
    const end = new Date(`${nowDay}T00:00:00Z`);
    while (cur < end) {
      const k = cur.toISOString().slice(0, 10);
      if (homeSet.has(k)) homeDayCount++;
      else if (underLoadSet.has(k)) underLoadDays++;
      else if (travelSet.has(k)) idleDays++;
      else homeDayCount++; // unmarked → home
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  const utilization =
    windowDays > 0 ? Math.min(1, underLoadDays / windowDays) : null;

  const monthsInService = inService
    ? Math.max(1, (now.getTime() - inService.getTime()) / (30.44 * DAY))
    : null;
  const milesPerMonth = monthsInService ? totalMiles / monthsInService : null;

  // All-in cost to run: fuel + maintenance (spend ÷ miles driven) plus the rig's own
  // note spread over the miles it runs a month. The note is a per-mile rate on a
  // different time base than fuel/maint, but each piece is a valid $/mi, so they add.
  const notePerMile =
    milesPerMonth && milesPerMonth > 0 && assetNote > 0 ? assetNote / milesPerMonth : null;
  const operatingPerMile =
    totalMiles > 0 ? (fuelSpend + maintSpend) / totalMiles : null;
  const costToRunPerMile =
    operatingPerMile != null ? operatingPerMile + (notePerMile ?? 0) : null;

  return {
    utilization,
    windowDays,
    underLoadDays,
    homeDays: homeDayCount,
    idleDays,
    avgMpg: fs.avgMpg,
    bestTank: fs.bestMpg,
    fuelPerMile: fs.costPerMile,
    revPerMile: totalMiles > 0 ? netRevenue / totalMiles : null,
    costToRunPerMile,
    fuelSpend,
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
