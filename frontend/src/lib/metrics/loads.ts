import type { Load } from "@/types/load";

// Total revenue for a load = linehaul + fuel surcharge + accessorials.
// Postgres numerics arrive as strings, so coerce before adding.
export const loadRevenue = (load: Load): number =>
  Number(load.linehaul) +
  Number(load.fuel_surcharge) +
  Number(load.total_accessorials);

export const getBookedCount = (loads: Array<Load>): number =>
  loads.filter((load) => load.load_status === "booked").length;

export const getInTransitCount = (loads: Array<Load>): number =>
  loads.filter((load) => load.load_status === "in_transit").length;

// Money still owed to us: delivered-but-unpaid, or anything invoiced.
export const outstandingLoads = (loads: Array<Load>): Array<Load> =>
  loads.filter(
    (load) =>
      (load.load_status === "delivered" && load.payment_status === "unpaid") ||
      load.payment_status === "invoiced",
  );

export const getOutstandingTotal = (loads: Array<Load>): number =>
  outstandingLoads(loads).reduce((total, load) => total + loadRevenue(load), 0);

// Rate per (loaded) mile for a single load; null when there are no loaded miles.
export const loadRpm = (load: Load): number | null => {
  const miles = Number(load.loaded_miles) || 0;
  return miles > 0 ? loadRevenue(load) / miles : null;
};

// Deadhead share of total miles (0–1); null when the load has no miles at all.
export const deadheadShare = (load: Load): number | null => {
  const loaded = Number(load.loaded_miles) || 0;
  const deadhead = Number(load.deadhead_miles) || 0;
  const total = loaded + deadhead;
  return total > 0 ? deadhead / total : null;
};

// Loads delivered in the current (UTC) month. Returns the array so callers can
// count them or sum their revenue. A delivered load with no delivery_date is
// excluded (we can't place it in a month).
export const deliveredThisMonth = (
  loads: Array<Load>,
  now: Date,
): Array<Load> => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return loads.filter((load) => {
    if (load.load_status !== "delivered" || !load.delivery_date) return false;
    const d = new Date(load.delivery_date);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });
};

export interface LoadsKpis {
  deliveredCount: number;
  deliveredGross: number;
  rpm: number | null; // revenue per loaded mile this month; null when no miles
  loadedMiles: number;
  arTotal: number;
  arCount: number;
  bookedCount: number;
  inTransitCount: number;
}

// The four loads-page KPIs in one pass: this month's earnings + efficiency,
// what's owed, and what's in the pipeline.
export const loadsKpis = (loads: Array<Load>, now: Date): LoadsKpis => {
  const delivered = deliveredThisMonth(loads, now);
  const deliveredGross = delivered.reduce((s, l) => s + loadRevenue(l), 0);
  const loadedMiles = delivered.reduce(
    (s, l) => s + (Number(l.loaded_miles) || 0),
    0,
  );
  const ar = outstandingLoads(loads);
  return {
    deliveredCount: delivered.length,
    deliveredGross,
    rpm: loadedMiles > 0 ? deliveredGross / loadedMiles : null,
    loadedMiles,
    arTotal: ar.reduce((s, l) => s + loadRevenue(l), 0),
    arCount: ar.length,
    bookedCount: getBookedCount(loads),
    inTransitCount: getInTransitCount(loads),
  };
};
