import type { Load } from "@/types/load";
// The canonical NET revenue helper (server-computed, after the carrier's cut).
// Aliased so the money KPIs below report what the company actually keeps.
import { loadNetRevenue as loadNet } from "./rateTargets";
import { loadDeadheadPct } from "./deadhead";
import { isDelivered } from "./status";

// Total revenue for a load = linehaul + fuel surcharge + accessorials.
// Postgres numerics arrive as strings, so coerce before adding.
export const loadRevenue = (load: Load): number =>
  Number(load.linehaul) +
  Number(load.fuel_surcharge) +
  Number(load.total_accessorials);

// The Loads page header: count, gross and gross $/loaded mile of what is in
// view. A TONU is never a booked load (it shows as its own row and counts only
// as the cash the statement paid), so it is out of all three.
export const loadsViewTotals = (
  view: Array<Load>,
): { count: number; gross: number; miles: number; rpm: number | null } => {
  const booked = view.filter((l) => l.load_status !== "tonu");
  const gross = booked.reduce((s, l) => s + loadRevenue(l), 0);
  const miles = booked.reduce((s, l) => s + (Number(l.loaded_miles) || 0), 0);
  return { count: booked.length, gross, miles, rpm: miles > 0 ? gross / miles : null };
};

export const getBookedCount = (loads: Array<Load>): number =>
  loads.filter((load) => load.load_status === "booked").length;

export const getInTransitCount = (loads: Array<Load>): number =>
  loads.filter((load) => load.load_status === "in_transit").length;

// Money still owed to us: delivered-but-unpaid, or anything invoiced.
export const outstandingLoads = (loads: Array<Load>): Array<Load> =>
  loads.filter(
    (load) =>
      (isDelivered(load) && load.payment_status === "unpaid") ||
      load.payment_status === "invoiced",
  );

export const getOutstandingTotal = (loads: Array<Load>): number =>
  outstandingLoads(loads).reduce((total, load) => total + loadRevenue(load), 0);

// Rate per (loaded) mile for a single load; null when there are no loaded miles.
export const loadRpm = (load: Load): number | null => {
  const miles = Number(load.loaded_miles) || 0;
  return miles > 0 ? loadRevenue(load) / miles : null;
};

// Deadhead share of total miles (0–1) for one load — odometer-derived, so null
// until the load has run and both readings are in. See metrics/deadhead.ts for
// why the deadhead_miles field is never the answer here.
export const deadheadShare = (load: Load): number | null =>
  loadDeadheadPct(load);

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
    if (!isDelivered(load) || !load.delivery_date) return false;
    const d = new Date(load.delivery_date);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  });
};

export interface LoadsKpis {
  deliveredCount: number;
  deliveredNet: number; // this month's delivered revenue, NET (what the company keeps)
  rpm: number | null; // GROSS rate per loaded mile this month; null when no miles
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
  // Dollars the company keeps (net); rate/mile stays gross (the booking lens).
  const deliveredNet = delivered.reduce((s, l) => s + loadNet(l), 0);
  const deliveredGross = delivered.reduce((s, l) => s + loadRevenue(l), 0);
  const loadedMiles = delivered.reduce(
    (s, l) => s + (Number(l.loaded_miles) || 0),
    0,
  );
  const ar = outstandingLoads(loads);
  return {
    deliveredCount: delivered.length,
    deliveredNet,
    rpm: loadedMiles > 0 ? deliveredGross / loadedMiles : null,
    loadedMiles,
    arTotal: ar.reduce((s, l) => s + loadNet(l), 0),
    arCount: ar.length,
    bookedCount: getBookedCount(loads),
    inTransitCount: getInTransitCount(loads),
  };
};
