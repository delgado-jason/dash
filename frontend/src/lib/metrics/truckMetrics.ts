// Truck-scoped operating metrics: how hard the truck runs (utilization, miles),
// how thirsty it is (fuel economy, fuel $/mi), how much it earns per mile, and what
// it costs to run (fuel + maintenance per mile — what the truck costs the owner, NOT
// counting the note, which lives in the payoff tracker). Pure; take `now` explicitly.
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
  costToRunPerMile: number | null; // (fuel + maintenance) ÷ miles
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
  homeDays: string[] = [], // "YYYY-MM-DD" home marks, for the week breakdown
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
  const windowDays = windowStart
    ? Math.max(
        1,
        Math.round(
          (Date.parse(`${nowDay}T00:00:00Z`) -
            Date.parse(`${windowStart}T00:00:00Z`)) /
            DAY,
        ),
      )
    : 0;

  const underLoadSet = underLoadDaySet(truckLoads, windowStart, nowDay);
  const underLoadDays = underLoadSet.size;
  const utilization =
    windowDays > 0 ? Math.min(1, underLoadDays / windowDays) : null;

  // Split the non-working days: home (marked home, not under load) vs truly idle.
  // Home days still count against utilization (the truck's costs accrue) — this
  // only labels why it wasn't earning.
  const homeDayCount = new Set(
    homeDays.filter(
      (d) =>
        (!windowStart || d >= windowStart) &&
        d <= nowDay &&
        !underLoadSet.has(d),
    ),
  ).size;
  const idleDays = Math.max(0, windowDays - underLoadDays - homeDayCount);

  const monthsInService = inService
    ? Math.max(1, (now.getTime() - inService.getTime()) / (30.44 * DAY))
    : null;

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
    costToRunPerMile: totalMiles > 0 ? (fuelSpend + maintSpend) / totalMiles : null,
    milesPerMonth: monthsInService ? totalMiles / monthsInService : null,
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
