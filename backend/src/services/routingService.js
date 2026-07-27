// Load-scoring mileage + route geometry, provider-agnostic. Talks to hereProvider
// today; swap that import to change providers. Everything here is an ESTIMATE for
// scoring/visualizing a load — the odometer stays the single source of truth.
import { geocode, routeMiles } from "./hereProvider.js";

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

// The two legs of a scored load: loaded (pickup → delivery) and, when we know
// where the truck is, deadhead (truck → pickup). Either can be null.
export async function loadMiles({ truckNow, pickup, delivery, dims } = {}) {
  const [loadedMiles, deadheadMiles] = await Promise.all([
    legMiles(pickup, delivery, dims),
    truckNow ? legMiles(truckNow, pickup, dims) : Promise.resolve(null),
  ]);
  return { loadedMiles, deadheadMiles };
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
