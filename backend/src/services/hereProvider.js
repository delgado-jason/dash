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
const MAP_IMAGE_URL = "https://image.maps.hereapi.com/mia/v3/base/mc";

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

// ---- static route map (for the "mission map") ----

// HERE route response → the flexible polyline(s), one per section, for drawing
// the route on a static map. null when there's no geometry.
export const parseRoutePolylines = (json) => {
  const sections = json?.routes?.[0]?.sections;
  if (!Array.isArray(sections)) return null;
  const polys = sections.map((s) => s?.polyline).filter(Boolean);
  return polys.length ? polys : null;
};

// The route's drawable geometry (flexible polylines) between two points. Plain
// truck mode — the map line is illustrative, so we skip dims here for speed and
// robustness (the Scorer's MILES are where dims matter). null when no route.
export const routePolylines = async (from, to) => {
  if (!hasKey() || !from || !to) return null;
  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    return: "polyline",
    apiKey: process.env.HERE_API_KEY,
  });
  const res = await fetch(`${ROUTER_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE route(polyline) failed (${res.status})`);
  return parseRoutePolylines(await res.json());
};

// Pure: assemble a Map Image v3 URL. `lines` = [{ polyline | coords[], color,
// width }], `points` = [{ lat, lng, color }] (colors are 6-hex, no '#'). HERE's
// overlay syntax needs ':' ';' ',' kept literal, so we build the query by hand
// and only encode the color '#' as %23. `overlay:padding` auto-fits the view.
export const buildMapImageUrl = ({
  apiKey,
  width = 640,
  height = 300,
  lines = [],
  points = [],
}) => {
  const overlays = [];
  for (const l of lines) {
    const geom = l.polyline ? l.polyline : l.coords.join(",");
    overlays.push(`line:${geom};color=%23${l.color};width=${l.width}`);
  }
  for (const p of points) {
    overlays.push(`multiPoint:${p.lat},${p.lng};color=%23${p.color};size=large`);
  }
  // Overlay values are already URL-safe (polyline is [A-Za-z0-9-_], plus digits,
  // '.', ':', ';', ','); the color '#' is the only reserved char, emitted as %23.
  const qs = overlays.map((o) => `overlay=${o}`).join("&");
  return `${MAP_IMAGE_URL}/overlay:padding=40/${width}x${height}/png?apiKey=${apiKey}&${qs}`;
};

// Fetch a Map Image URL and return it as a base64 PNG data URI — so it rides
// authenticated JSON to the browser and the key never leaves the server.
export const fetchMapDataUri = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HERE map image failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
};
