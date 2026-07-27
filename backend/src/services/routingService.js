// Load-scoring mileage, provider-agnostic. Talks to hereProvider today; swap that
// import to change providers. Everything here is an ESTIMATE for scoring a load
// before it runs — the odometer stays the single source of truth once it does.
import {
  geocode,
  routeMiles,
  routePolylines,
  buildMapImageUrl,
  fetchMapDataUri,
} from "./hereProvider.js";

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

// ---- the "mission map" ----

// Map colors (6-hex, no '#') — the paid haul in amber, the empty leg in gray,
// pickup green, destination red, and a faint pin where the deadhead began.
const C_LOADED = "f5b03a";
const C_DEADHEAD = "6f7a8c";
const C_START = "4ade80";
const C_OBJECTIVE = "f87171";
const C_DH_ORIGIN = "8b98a9";

// Tiny bounded cache: a route's rendered image doesn't change, so don't re-hit
// HERE for the same haul. Keyed by the three places; oldest evicted past cap.
const mapCache = new Map();
const MAP_CACHE_CAP = 60;

// A rendered route-map data URI (PNG) for a load: the loaded haul
// (pickup→delivery) and, when we know where the truck came from, the deadhead
// leg into the pickup. null on any failure — the caller shows the text route.
export async function renderRouteMap({ deadheadOrigin, pickup, delivery } = {}) {
  if (!process.env.HERE_API_KEY) return null;
  if (!pickup?.city || !pickup?.state || !delivery?.city || !delivery?.state)
    return null;

  const key = JSON.stringify({ deadheadOrigin, pickup, delivery });
  if (mapCache.has(key)) return mapCache.get(key);

  let image = null;
  try {
    const [pk, dl, dh] = await Promise.all([
      geocode(pickup.city, pickup.state),
      geocode(delivery.city, delivery.state),
      deadheadOrigin?.city && deadheadOrigin?.state
        ? geocode(deadheadOrigin.city, deadheadOrigin.state)
        : null,
    ]);
    if (pk && dl) {
      const points = [];
      if (dh) points.push({ lat: dh.lat, lng: dh.lng, color: C_DH_ORIGIN });
      points.push({ lat: pk.lat, lng: pk.lng, color: C_START });
      points.push({ lat: dl.lat, lng: dl.lng, color: C_OBJECTIVE });

      // Straight raw-coord segments — the confirmed-working fallback.
      const straight = [];
      if (dh)
        straight.push({ coords: [dh.lat, dh.lng, pk.lat, pk.lng], color: C_DEADHEAD, width: 4 });
      straight.push({ coords: [pk.lat, pk.lng, dl.lat, dl.lng], color: C_LOADED, width: 5 });

      // Road-route geometry — the nicer primary, per leg (polyline when HERE
      // returns it, otherwise that leg's straight segment).
      const road = [];
      if (dh) {
        const p = await routePolylines(dh, pk);
        if (p) for (const pl of p) road.push({ polyline: pl, color: C_DEADHEAD, width: 4 });
        else road.push({ coords: [dh.lat, dh.lng, pk.lat, pk.lng], color: C_DEADHEAD, width: 4 });
      }
      const lp = await routePolylines(pk, dl);
      if (lp) for (const pl of lp) road.push({ polyline: pl, color: C_LOADED, width: 5 });
      else road.push({ coords: [pk.lat, pk.lng, dl.lat, dl.lng], color: C_LOADED, width: 5 });

      // Try the road route; if its image request fails (rejected polyline, URL
      // too long), fall back to plain straight lines so a map still renders.
      for (const lines of [road, straight]) {
        try {
          const url = buildMapImageUrl({
            apiKey: process.env.HERE_API_KEY,
            width: 640,
            height: 300,
            lines,
            points,
          });
          image = await fetchMapDataUri(url);
          if (image) break;
        } catch {
          // try the next line style
        }
      }
    }
  } catch {
    image = null;
  }

  if (image) {
    mapCache.set(key, image);
    if (mapCache.size > MAP_CACHE_CAP)
      mapCache.delete(mapCache.keys().next().value);
  }
  return image;
}
