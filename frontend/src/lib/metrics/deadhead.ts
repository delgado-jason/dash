import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

// ---- The single source of truth for ACTUAL deadhead. ----
//
// Actual deadhead is ALWAYS derived from odometer deltas: the miles the truck
// physically turned, minus the miles that paid as loaded.
//
// The `deadhead_miles` field on the load form is NOT this. It is a hand-entered
// PLANNING estimate — it feeds the fuel estimate and scores a prospective load
// before it's booked, where no odometer reading exists yet. It also materially
// understates reality, because it only describes the planned empty leg to the
// shipper: measured against prod, 2026 empty miles are 13,986 by odometer vs
// 11,557 by the field, a ~17% gap. Never use it as actual deadhead.
//
// Every deadhead figure in the app routes through this file so one number means
// one thing everywhere.

// A load contributes real miles only once it has run with both odometer
// readings recorded. Payment status is irrelevant — what matters is that the
// truck moved.
export const hasOdometerWindow = (l: Load): boolean =>
  l.load_status === "delivered" &&
  l.odometer_start != null &&
  l.odometer_end != null;

const tripHasWindow = (t: Trip): boolean =>
  t.odometer_start != null && t.odometer_end != null;

// Miles the truck actually turned on this load. Null when unknown — never 0,
// because "no odometer recorded" is not "drove nowhere".
export const loadTotalMiles = (l: Load): number | null =>
  hasOdometerWindow(l)
    ? Number(l.odometer_end) - Number(l.odometer_start)
    : null;

// Miles run empty on this load: everything the odometer counted that didn't pay
// as loaded. Null when the odometer window is unknown.
export const loadEmptyMiles = (l: Load): number | null => {
  const total = loadTotalMiles(l);
  if (total === null) return null;
  return total - (Number(l.loaded_miles) || 0);
};

// Deadhead share (0–1) for a single load. Null when unknown.
export const loadDeadheadPct = (l: Load): number | null => {
  const total = loadTotalMiles(l);
  const empty = loadEmptyMiles(l);
  if (total === null || empty === null || total <= 0) return null;
  return empty / total;
};

// Deadhead share (0–1) across a set of loads plus non-revenue trips. Trips are
// 100% empty, so their whole odometer window counts as deadhead — a week spent
// running home empty should read as the expensive week it was.
//
// Callers scope by date (or driver, or truck) and pass the set; the qualifying
// filter is applied here so every caller gets identical semantics. Returns null
// when nothing in the set has a usable odometer window.
export const deadheadPctOver = (
  loads: Load[],
  trips: Trip[] = [],
): number | null => {
  const usable = loads.filter(hasOdometerWindow);
  const usableTrips = trips.filter(tripHasWindow);

  const loadWindow = usable.reduce(
    (sum, l) => sum + (Number(l.odometer_end) - Number(l.odometer_start)),
    0,
  );
  const tripWindow = usableTrips.reduce(
    (sum, t) => sum + (Number(t.odometer_end) - Number(t.odometer_start)),
    0,
  );
  const totalMiles = loadWindow + tripWindow;
  if (totalMiles <= 0) return null;

  const loadedMiles = usable.reduce(
    (sum, l) => sum + (Number(l.loaded_miles) || 0),
    0,
  );
  return (totalMiles - loadedMiles) / totalMiles;
};

// Empty miles (absolute, not a share) across a set — for "you ran N miles empty"
// readouts. Null when nothing has a usable odometer window.
export const emptyMilesOver = (
  loads: Load[],
  trips: Trip[] = [],
): number | null => {
  const usable = loads.filter(hasOdometerWindow);
  const usableTrips = trips.filter(tripHasWindow);
  if (usable.length === 0 && usableTrips.length === 0) return null;

  const loadEmpty = usable.reduce((sum, l) => sum + (loadEmptyMiles(l) ?? 0), 0);
  const tripEmpty = usableTrips.reduce(
    (sum, t) => sum + (Number(t.odometer_end) - Number(t.odometer_start)),
    0,
  );
  return loadEmpty + tripEmpty;
};
