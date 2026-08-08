// Trailer-scoped metrics. A trailer has no engine, so there's no fuel line — its
// cost to run is maintenance plus its own note (passed in as `assetNote`), and it
// earns on its own 8% slice of the loads it carried. Pure; take `now` explicitly.
import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import type { Trailer } from "@/types/trailer";
import { loadTrailerNet } from "./rateTargets";

export interface TrailerMetrics {
  utilization: number | null; // active weeks ÷ weeks in service
  earningsPerMile: number | null; // its 8% share ÷ miles carried
  costToRunPerMile: number | null; // (maintenance + note) ÷ miles (no fuel) — all-in
  notePerMile: number | null; // trailer note ÷ miles/month (null when no note passed)
  milesPerMonth: number | null;
  totalMiles: number;
  earnings: number; // cumulative 8% share
  loads: number;
}

const DAY = 86_400_000;

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

// Maintenance attributable to the trailer (trailer + both units).
const trailerServiceSpend = (services: MaintenanceService[]): number =>
  services
    .filter((s) => s.unit === "trailer" || s.unit === "both")
    .reduce((sum, s) => sum + (Number(s.cost) || 0), 0);

export const computeTrailerMetrics = (
  trailer: Trailer,
  trailerLoads: Load[],
  services: MaintenanceService[],
  now: Date,
  assetNote = 0, // monthly trailer note — folds into cost-to-run
): TrailerMetrics => {
  const earnedLoads = trailerLoads.filter(
    (l) => l.load_status === "delivered" && l.payment_status === "paid",
  );
  const earnings = earnedLoads.reduce((s, l) => s + loadTrailerNet(l), 0);
  const totalMiles = earnedLoads.reduce((s, l) => s + loadMiles(l), 0);
  const maintSpend = trailerServiceSpend(services);

  const inService = trailer.in_service_date
    ? new Date(trailer.in_service_date.slice(0, 10) + "T00:00:00Z")
    : null;
  const weeksInService = inService
    ? Math.max(1, Math.round((now.getTime() - inService.getTime()) / (7 * DAY)))
    : null;
  const activeWeeks = new Set(
    earnedLoads.filter((l) => l.delivery_date).map((l) => weekKey(l.delivery_date!)),
  ).size;
  const utilization =
    weeksInService && weeksInService > 0 ? Math.min(1, activeWeeks / weeksInService) : null;
  const monthsInService = inService
    ? Math.max(1, (now.getTime() - inService.getTime()) / (30.44 * DAY))
    : null;
  const milesPerMonth = monthsInService ? totalMiles / monthsInService : null;

  // All-in: maintenance ÷ miles plus the trailer's own note spread over its monthly
  // miles. Mirrors the truck's cost-to-run so the label means the same thing.
  const notePerMile =
    milesPerMonth && milesPerMonth > 0 && assetNote > 0 ? assetNote / milesPerMonth : null;
  const operatingPerMile = totalMiles > 0 ? maintSpend / totalMiles : null;
  const costToRunPerMile =
    operatingPerMile != null ? operatingPerMile + (notePerMile ?? 0) : null;

  return {
    utilization,
    earningsPerMile: totalMiles > 0 ? earnings / totalMiles : null,
    costToRunPerMile,
    notePerMile,
    milesPerMonth,
    totalMiles,
    earnings,
    loads: earnedLoads.length,
  };
};

export interface TrailerFleetRow {
  trailerId: string;
  unit: string;
  utilization: number | null;
  earningsPerMile: number | null;
  milesPerMonth: number | null;
  earnings: number;
}

export const trailerFleetSummary = (
  trailers: Trailer[],
  loads: Load[],
  services: MaintenanceService[],
  now: Date,
): TrailerFleetRow[] =>
  trailers.map((t) => {
    const m = computeTrailerMetrics(
      t,
      loads.filter((l) => l.trailer_id === t.trailer_id),
      services,
      now,
    );
    return {
      trailerId: t.trailer_id,
      unit: t.unit_number,
      utilization: m.utilization,
      earningsPerMile: m.earningsPerMile,
      milesPerMonth: m.milesPerMonth,
      earnings: m.earnings,
    };
  });
