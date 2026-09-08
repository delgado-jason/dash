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
const AUTOCOMPLETE_URL = "https://autocomplete.search.hereapi.com/v1/autocomplete";
const LOOKUP_URL = "https://lookup.search.hereapi.com/v1/lookup";

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
  // Cache HITS only. Caching a null pinned one transient empty response into
  // every later route for the life of the process (weeks on Railway) — the
  // deadhead leg then silently failed on every score (2026-09-08).
  if (coords) geoCache.set(key, coords);
  return coords;
};

// ---- detailed geocode + validation (for the persistent city_coords cache) ----
// The plain geocode above returns just { lat, lng } and is fine for the live map.
// The Foreman STORES coordinates, so it needs enough context to TRUST one before
// persisting it — the state HERE actually matched, whether it's a US result, and
// HERE's own confidence — so a wrong point never silently poisons a ranking.

// US bounding box (continental + AK + HI + PR): generous, but enough to reject an
// obviously-wrong hit like a same-named foreign city.
export const US_BOUNDS = { minLat: 15, maxLat: 72, minLng: -170, maxLng: -64 };

// HERE geocode item → the fields we need to trust a coordinate. `found:false` when
// nothing usable came back (the API answered but matched nothing).
export const parseGeocodeDetailed = (json) => {
  const item = json?.items?.[0];
  const pos = item?.position;
  if (!item || !pos || typeof pos.lat !== "number" || typeof pos.lng !== "number")
    return { found: false };
  return {
    found: true,
    lat: pos.lat,
    lng: pos.lng,
    stateCode: item.address?.stateCode ?? null,
    countryCode: item.address?.countryCode ?? null,
    resultType: item.resultType ?? null,
    queryScore:
      typeof item.scoring?.queryScore === "number" ? item.scoring.queryScore : null,
    label: item.address?.label ?? item.title ?? null,
  };
};

// Is a detailed result trustworthy enough to STORE? We keep a coordinate only when
// HERE agrees on the state, it's a US result, it sits inside US bounds, and it
// clears the confidence floor. Anything else → don't store a number, fall back to
// region-level. Pure + unit-tested (no key needed).
// → { ok:true, coords, label, queryScore } | { ok:false, reason }
export const validateGeocodeResult = (state, d, minScore = 0.8) => {
  if (!d || d.found === false) return { ok: false, reason: "no_match" };
  const st = String(state ?? "").trim().toUpperCase();
  if (d.countryCode && d.countryCode !== "USA")
    return { ok: false, reason: `country_${d.countryCode}` };
  if (!d.stateCode || d.stateCode.toUpperCase() !== st)
    return { ok: false, reason: `state_mismatch_${d.stateCode ?? "none"}` };
  if (
    d.lat < US_BOUNDS.minLat ||
    d.lat > US_BOUNDS.maxLat ||
    d.lng < US_BOUNDS.minLng ||
    d.lng > US_BOUNDS.maxLng
  )
    return { ok: false, reason: "out_of_bounds" };
  // Fail closed: a missing OR low confidence score is not trustworthy enough to
  // STORE (city_coords is write-once), so we fall back to region-level instead.
  if (d.queryScore == null) return { ok: false, reason: "no_score" };
  if (d.queryScore < minScore)
    return { ok: false, reason: `low_score_${d.queryScore.toFixed(2)}` };
  return {
    ok: true,
    coords: { lat: d.lat, lng: d.lng },
    label: d.label,
    queryScore: d.queryScore,
  };
};

// city/state → detailed geocode. Returns null when unconfigured/blank (a SKIP —
// the caller must NOT persist a failure, so a later attempt with a key can still
// succeed); throws on HTTP error (transient); otherwise the parsed detail
// ({ found:true, … } | { found:false }).
export const geocodeDetailed = async (city, state) => {
  if (!hasKey() || !city || !state) return null;
  const params = new URLSearchParams({
    q: `${city.trim()}, ${state.trim()}, USA`,
    apiKey: process.env.HERE_API_KEY,
    limit: "1",
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE geocode failed (${res.status})`);
  return parseGeocodeDetailed(await res.json());
};

// Apply the load's dims to a routing request — HERE wants centimeters + kg.
// Turns on PHYSICAL restrictions (the oversize reroute around low bridges,
// narrow roads, weight limits) and, for tolls, the correct vehicle toll class.
const setVehicleDims = (params, dims) => {
  if (!dims) return;
  if (dims.widthIn) params.set("vehicle[width]", String(inchesToCm(dims.widthIn)));
  if (dims.heightIn) params.set("vehicle[height]", String(inchesToCm(dims.heightIn)));
  if (dims.lengthIn) params.set("vehicle[length]", String(inchesToCm(dims.lengthIn)));
  if (dims.grossWeightLb)
    params.set("vehicle[grossWeight]", String(poundsToKg(dims.grossWeightLb)));
};

// Driving miles between two { lat, lng } points as a truck. null when
// unconfigured or no route.
export const routeMiles = async (from, to, dims) => {
  if (!hasKey() || !from || !to) return null;
  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    return: "summary",
    apiKey: process.env.HERE_API_KEY,
  });
  setVehicleDims(params, dims);
  const res = await fetch(`${ROUTER_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE route failed (${res.status})`);
  const meters = parseRouteMeters(await res.json());
  return meters == null ? null : metersToMiles(meters);
};

// Pure: HERE route (return=…,tolls) → total toll cost, summing every fare in
// every section. null when there's no toll data (or a toll-free route).
export const parseRouteTolls = (json) => {
  const sections = json?.routes?.[0]?.sections;
  if (!Array.isArray(sections)) return null;
  let total = 0;
  let found = false;
  for (const s of sections) {
    if (!Array.isArray(s?.tolls)) continue;
    for (const t of s.tolls) {
      if (!Array.isArray(t?.fares)) continue;
      for (const f of t.fares) {
        const v = Number(f?.price?.value);
        if (Number.isFinite(v)) {
          total += v;
          found = true;
        }
      }
    }
  }
  return found ? Math.round(total * 100) / 100 : null;
};

// Miles AND estimated toll cost for a leg in one call, with the truck's dims so
// the toll class is right. { miles, tollUsd }, either possibly null.
export const routeMilesAndTolls = async (from, to, dims) => {
  if (!hasKey() || !from || !to) return { miles: null, tollUsd: null };
  const params = new URLSearchParams({
    transportMode: "truck",
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    return: "summary,tolls",
    currency: "USD",
    apiKey: process.env.HERE_API_KEY,
  });
  setVehicleDims(params, dims);
  const res = await fetch(`${ROUTER_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE route(tolls) failed (${res.status})`);
  const json = await res.json();
  const meters = parseRouteMeters(json);
  return {
    miles: meters == null ? null : metersToMiles(meters),
    tollUsd: parseRouteTolls(json),
  };
};

// ---- prominence-aware city geocoding (the scoring path) ----
// Plain /geocode's top hit is a text match, not the place a human means:
// "Walker, MI" returned Walker Twp near Mackinac (not the Grand Rapids city),
// putting 476 phantom deadhead miles on a scored load (2026-09-09). The
// autocomplete index ranks by prominence, so its first same-state hit is the
// city a load posting means; /lookup turns that hit's id into coordinates.
//
// The unsolvable case is real twins: HERE holds TWO localities both labeled
// "Milford, IN". No provider can pick the right one from city+state text —
// Google guesses popular, HERE guesses the other one. We refuse to guess:
// twins come back AMBIGUOUS and the leg goes unrouted, so the human types
// the miles instead of trusting a coin flip.

// Pure: autocomplete response + requested city/state →
// { status: "ok", id } | { status: "ambiguous", label } | { status: "none" }.
// Only exact same-state city-name matches count; a name variant ("Walker Twp")
// never blocks the exact match, and cross-state fuzz ("Midway, TX") is dropped.
export const parseAutocompleteCity = (json, city, state) => {
  const items = Array.isArray(json?.items) ? json.items : [];
  const wantCity = String(city ?? "").trim().toUpperCase();
  const wantSt = String(state ?? "").trim().toUpperCase();
  const exact = items.filter((i) => {
    const a = i?.address;
    return (
      !!i?.id &&
      a?.stateCode?.toUpperCase() === wantSt &&
      a?.city?.trim()?.toUpperCase() === wantCity
    );
  });
  if (exact.length === 0) return { status: "none" };
  const top = exact[0];
  const topLabel = (top.address?.label ?? "").toUpperCase();
  const twins = exact.filter(
    (i) => (i.address?.label ?? "").toUpperCase() === topLabel,
  );
  if (twins.length > 1) return { status: "ambiguous", label: top.address?.label };
  return { status: "ok", id: top.id };
};

// Pure: /lookup response → { lat, lng } | null.
export const parseLookup = (json) => {
  const pos = json?.position;
  if (!pos || typeof pos.lat !== "number" || typeof pos.lng !== "number")
    return null;
  return { lat: pos.lat, lng: pos.lng };
};

// city/state → { lat, lng } via autocomplete prominence, falling back to the
// plain geocoder for places too small for the city index. null when
// unconfigured, unmatched, or AMBIGUOUS (twins — the caller must not guess).
export const geocodeCity = async (city, state) => {
  if (!hasKey() || !city || !state) return null;
  const key = `CITY:${city.trim()}, ${state.trim()}`.toUpperCase();
  if (geoCache.has(key)) return geoCache.get(key);

  const params = new URLSearchParams({
    q: `${city.trim()}, ${state.trim()}`,
    in: "countryCode:USA",
    types: "city",
    limit: "5",
    apiKey: process.env.HERE_API_KEY,
  });
  const res = await fetch(`${AUTOCOMPLETE_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE autocomplete failed (${res.status})`);
  const pick = parseAutocompleteCity(await res.json(), city, state);

  if (pick.status === "ambiguous") return null; // twins: never guess, never cache
  if (pick.status === "ok") {
    const lres = await fetch(
      `${LOOKUP_URL}?${new URLSearchParams({ id: pick.id, apiKey: process.env.HERE_API_KEY })}`,
    );
    if (!lres.ok) throw new Error(`HERE lookup failed (${lres.status})`);
    const coords = parseLookup(await lres.json());
    if (coords) {
      geoCache.set(key, coords);
      return coords;
    }
  }
  return geocode(city, state); // tiny places live only in the geocode index
};

// ---- city autocomplete ----

// Pure: HERE autocomplete response → up to `limit` city suggestions
// [{ city, state, label }]. Keeps any US result that resolves to a city + a
// 2-letter state, de-duped by "CITY,ST" (so a street and its city collapse to
// one city suggestion). Robust whether or not the request filtered by type.
export const parseCitySuggestions = (json, limit = 6) => {
  const items = json?.items;
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const a = it?.address;
    const city = a?.city?.trim();
    const state = a?.stateCode?.trim()?.toUpperCase();
    if (!city || !state || state.length !== 2) continue;
    const key = `${city.toUpperCase()},${state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ city, state, label: `${city}, ${state}` });
    if (out.length >= limit) break;
  }
  return out;
};

// City typeahead suggestions for a partial query (US cities). [] when
// unconfigured or the query is too short to be worth a call.
export const citySuggest = async (q) => {
  if (!hasKey() || !q || q.trim().length < 2) return [];
  const params = new URLSearchParams({
    q: q.trim(),
    in: "countryCode:USA",
    types: "city",
    limit: "10",
    apiKey: process.env.HERE_API_KEY,
  });
  const res = await fetch(`${AUTOCOMPLETE_URL}?${params}`);
  if (!res.ok) throw new Error(`HERE autocomplete failed (${res.status})`);
  return parseCitySuggestions(await res.json());
};
