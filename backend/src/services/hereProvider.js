// HERE Technologies routing adapter. Isolated on purpose: the rest of the app
// talks to routingService, which talks to this — so swapping providers (Google,
// PC*Miler) is a one-file change. Server-side only, so the key never reaches the
// browser; everything degrades to null when HERE_API_KEY is unset.
//
// HERE speaks metric: routes come back in METERS, and vehicle dimensions go out
// in CENTIMETERS, gross weight in KILOGRAMS. We convert at this boundary so the
// rest of the app stays in the units it already uses (miles, inches, pounds).

const GEOCODE_URL = "https://geocode.search.hereapi.com/v1/geocode";
const ROUTER_URL = "https://router.hereapi.com/v8/routes";

// ---- unit conversions (pure) ----
export const metersToMiles = (m) => m / 1609.344;
export const inchesToCm = (inch) => Math.round(inch * 2.54);
export const poundsToKg = (lb) => Math.round(lb * 0.45359237);

// ---- pure parsers (unit-tested; no key needed) ----

// HERE geocode response → { lat, lng } of the top hit, or null when nothing
// matched or the shape is off.
export const parseGeocode = (json) => {
  const pos = json?.items?.[0]?.position;
  if (!pos || typeof pos.lat !== "number" || typeof pos.lng !== "number")
    return null;
  return { lat: pos.lat, lng: pos.lng };
};

// HERE route response → total METERS across every section, or null when there's
// no usable route (a section missing its length means we can't trust the total).
export const parseRouteMeters = (json) => {
  const sections = json?.routes?.[0]?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return null;
  let meters = 0;
  for (const s of sections) {
    const len = s?.summary?.length;
    if (typeof len !== "number") return null;
    meters += len;
  }
  return meters;
};

const hasKey = () => !!process.env.HERE_API_KEY;

// city/state → { lat, lng }, cached for the process (a city center doesn't move).
// null when unconfigured, blank, or no match.
const geoCache = new Map();
export const geocode = async (city, state) => {
  if (!hasKey() || !city || !state) return null;
  const key = `${city.trim()}, ${state.trim()}`.toUpperCase();
  if (geoCache.has(key)) return geoCache.get(key);

  const params = new URLSearchParams({
    q: `${city.trim()}, ${state.trim()}, USA`,
    apiKey: process.env.HERE_API_KEY,
    limit: "1",
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE geocode failed (${res.status})`);
  const coords = parseGeocode(await res.json());
  geoCache.set(key, coords);
  return coords;
};

// Driving miles between two { lat, lng } points as a truck. Optional dims
// (inches + gross pounds) turn on PHYSICAL restrictions — the oversize routing
// that reroutes around low bridges, narrow roads, and weight-limited segments.
// null when unconfigured or no route.
export const routeMiles = async (from, to, dims) => {
  if (!hasKey() || !from || !to) return null;

  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    return: "summary",
    apiKey: process.env.HERE_API_KEY,
  });

  if (dims) {
    if (dims.widthIn) params.set("vehicle[width]", String(inchesToCm(dims.widthIn)));
    if (dims.heightIn) params.set("vehicle[height]", String(inchesToCm(dims.heightIn)));
    if (dims.lengthIn) params.set("vehicle[length]", String(inchesToCm(dims.lengthIn)));
    if (dims.grossWeightLb)
      params.set("vehicle[grossWeight]", String(poundsToKg(dims.grossWeightLb)));
  }

  const res = await fetch(`${ROUTER_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE route failed (${res.status})`);
  const meters = parseRouteMeters(await res.json());
  return meters == null ? null : metersToMiles(meters);
};
