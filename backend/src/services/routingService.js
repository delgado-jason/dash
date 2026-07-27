// Load-scoring mileage + route geometry, provider-agnostic. Talks to hereProvider
// today; swap that import to change providers. Everything here is an ESTIMATE for
// scoring/visualizing a load — the odometer stays the single source of truth.
import { geocode, routeMiles, routeMilesAndTolls } from "./hereProvider.js";

// One leg's miles: geocode both ends, then route between them with the load's
// dims. Self-contained try/catch so a failure on one leg never sinks the other
// or the whole request — the Scorer just falls back to manual entry for it.
async function legMiles(from, to, dims) {
  try {
    if (!from?.city || !from?.state || !to?.city || !to?.state) return null;
    const [a, b] = await Promise.all([
      geocode(from.city, from.state),
      geocode(to.city, to.state),
    ]);
    if (!a || !b) return null;
    const mi = await routeMiles(a, b, dims);
    return mi == null ? null : Math.round(mi * 10) / 10;
  } catch {
    return null;
  }
}

// The loaded leg, with estimated tolls (billed as a 100% accessorial, so the
// Scorer can prompt the ask). Self-contained try/catch like legMiles.
async function legMilesAndTolls(from, to, dims) {
  try {
    if (!from?.city || !from?.state || !to?.city || !to?.state)
      return { miles: null, tollUsd: null };
    const [a, b] = await Promise.all([
      geocode(from.city, from.state),
      geocode(to.city, to.state),
    ]);
    if (!a || !b) return { miles: null, tollUsd: null };
    const { miles, tollUsd } = await routeMilesAndTolls(a, b, dims);
    return { miles: miles == null ? null : Math.round(miles * 10) / 10, tollUsd };
  } catch {
    return { miles: null, tollUsd: null };
  }
}

// The two legs of a scored load: loaded (pickup → delivery, with tolls) and,
// when we know where the truck is, deadhead (truck → pickup). Any can be null.
export async function loadMiles({ truckNow, pickup, delivery, dims } = {}) {
  const [loaded, deadheadMiles] = await Promise.all([
    legMilesAndTolls(pickup, delivery, dims),
    truckNow ? legMiles(truckNow, pickup, dims) : Promise.resolve(null),
  ]);
  return {
    loadedMiles: loaded.miles,
    deadheadMiles,
    tollUsd: loaded.tollUsd,
  };
}

// ---- route geometry for the "mission map" ----
// Geocode each end to { lat, lng, city, state } so the frontend can draw the
// route AND the faint state borders in one coordinate space. A point that won't
// geocode (or a null deadhead — e.g. a booked load) comes back null; the map
// falls back to the text route when pickup/delivery can't resolve.
export async function routeGeo({ deadheadOrigin, pickup, delivery } = {}) {
  const geo = async (p) => {
    if (!p?.city || !p?.state) return null;
    try {
      const c = await geocode(p.city, p.state);
      return c ? { lat: c.lat, lng: c.lng, city: p.city.trim(), state: p.state.trim() } : null;
    } catch {
      return null;
    }
  };
  const [pickupGeo, deliveryGeo, deadheadGeo] = await Promise.all([
    geo(pickup),
    geo(delivery),
    geo(deadheadOrigin),
  ]);
  return { pickup: pickupGeo, delivery: deliveryGeo, deadhead: deadheadGeo };
}
