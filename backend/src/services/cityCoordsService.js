import { db } from "../../db/pool.js";
import { geocodeDetailed, validateGeocodeResult } from "./hereProvider.js";

// The persistent city-coordinate cache behind the Foreman's straight-line
// distances. Geocode a (city, state) via HERE ONCE, validate it, store it, and
// never call the API for that city again. Normalization matches the migration
// (trim + uppercase) and the in-process geoCache key in hereProvider.
const norm = (s) => String(s ?? "").trim().toUpperCase();

// Every verified coordinate, as a flat list the frontend distances against. One
// row per distinct city ever booked (small), so we return the whole table.
export async function getVerifiedCoords() {
  const { rows } = await db.query(
    `SELECT city_norm, state, lat, lng FROM city_coords WHERE status = 'verified'`,
  );
  return rows; // [{ city_norm, state, lat, lng }]
}

// Resolve one (city, state) into the cache. Idempotent: a row that already exists
// — verified OR failed — is left alone (a city center doesn't move, and a genuine
// bad match won't spontaneously fix itself, so we never re-hit HERE for it). A
// TRANSIENT miss (no API key, network error, or the API matched nothing) persists
// NOTHING, so a later attempt can still succeed. Returns { lat, lng } | null.
export async function ensureCityCoords(city, state) {
  const c = norm(city);
  const s = norm(state);
  if (!c || !s) return null;

  const existing = await db.query(
    `SELECT lat, lng, status FROM city_coords WHERE city_norm = $1 AND state = $2`,
    [c, s],
  );
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    return row.status === "verified" ? { lat: row.lat, lng: row.lng } : null;
  }

  let detail;
  try {
    detail = await geocodeDetailed(city, state);
  } catch {
    return null; // transient (HTTP / network) — leave absent so we retry later
  }
  if (detail == null) return null; // unconfigured / blank — don't persist a failure

  const v = validateGeocodeResult(s, detail);
  if (v.ok) {
    await db.query(
      `INSERT INTO city_coords (city_norm, state, lat, lng, label, query_score, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'verified')
       ON CONFLICT (city_norm, state) DO NOTHING`,
      [c, s, v.coords.lat, v.coords.lng, v.label ?? null, v.queryScore ?? null],
    );
    return { lat: v.coords.lat, lng: v.coords.lng };
  }

  // A real, trustworthy negative (wrong state / out of bounds / low score / the
  // API found nothing): record the miss so we don't waste a call on it again.
  await db.query(
    `INSERT INTO city_coords (city_norm, state, status, failure_reason)
     VALUES ($1, $2, 'failed', $3)
     ON CONFLICT (city_norm, state) DO NOTHING`,
    [c, s, v.reason ?? "unknown"],
  );
  return null;
}

// Warm the cache for many places, de-duped and SEQUENTIAL — keeps HERE calls
// gentle (no 50-at-once burst against the rate limit). Returns how many resolved.
// Meant to run fire-and-forget in the background off a page load.
export async function ensureManyCityCoords(places) {
  const seen = new Set();
  let resolved = 0;
  for (const p of places ?? []) {
    const c = norm(p?.city);
    const s = norm(p?.state);
    if (!c || !s) continue;
    const key = `${c},${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await ensureCityCoords(p.city, p.state);
    if (r) resolved++;
  }
  return resolved;
}
