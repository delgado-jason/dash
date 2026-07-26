// Load-scoring mileage, provider-agnostic. Talks to hereProvider today; swap that
// import to change providers. Everything here is an ESTIMATE for scoring a load
// before it runs — the odometer stays the single source of truth once it does.
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
