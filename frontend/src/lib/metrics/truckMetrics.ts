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

export interface TruckMetrics {
  utilization: number | null; // active weeks ÷ weeks in service (0..1)
  activeWeeks: number;
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

const weekKey = (iso: string): string => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
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
): TruckMetrics => {
  // Earned freight — delivered AND paid — matches the truck's net revenue elsewhere.
  const earned = truckLoads.filter(
    (l) => l.load_status === "delivered" && l.payment_status === "paid",
  );
  const netRevenue = earned.reduce((s, l) => s + loadRevenue(l), 0);
  const totalMiles = earned.reduce((s, l) => s + loadMiles(l), 0);

  const fs = fuelStats(truckFuel, now);
  const fuelSpend = fs.totalSpend;
  const maintSpend = truckServiceSpend(services);

  // Utilization — share of the weeks it's been in service that it actually ran.
  const inService = truck.in_service_date
    ? new Date(truck.in_service_date.slice(0, 10) + "T00:00:00Z")
    : null;
  const weeksInService = inService
    ? Math.max(1, Math.round((now.getTime() - inService.getTime()) / (7 * DAY)))
    : null;
  const activeWeeks = new Set(
    earned.filter((l) => l.delivery_date).map((l) => weekKey(l.delivery_date!)),
  ).size;
  const utilization =
    weeksInService && weeksInService > 0
      ? Math.min(1, activeWeeks / weeksInService)
      : null;

  const monthsInService = inService
    ? Math.max(1, (now.getTime() - inService.getTime()) / (30.44 * DAY))
    : null;

  return {
    utilization,
    activeWeeks,
    avgMpg: fs.avgMpg,
    bestTank: fs.bestMpg,
    fuelPerMile: fs.costPerMile,
    revPerMile: totalMiles > 0 ? netRevenue / totalMiles : null,
    costToRunPerMile: totalMiles > 0 ? (fuelSpend + maintSpend) / totalMiles : null,
    milesPerMonth: monthsInService ? totalMiles / monthsInService : null,
    totalMiles,
    netRevenue,
    loads: earned.length,
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
