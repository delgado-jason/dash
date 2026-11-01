// Macro freight-rate barometer from the U.S. FRED (St. Louis Fed), fetched
// server-side so the API key never reaches the browser. Series PCU484230484230 —
// PPI by Industry: Specialized Freight (except Used Goods) Trucking, Long-Distance
// (monthly, index Dec-2003=100). Flatbed/oversize is "specialized freight," so
// this is the closest public macro read for Jason's niche. Cached in memory; the
// series only updates monthly, so there's no reason to hit FRED per page load.

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const SERIES_ID = "PCU484230484230";
// U.S. No. 2 diesel retail price, weekly (EIA via FRED) — asked for as monthly
// averages, so the Market page can tell a fuel move from a rate move: the PPI
// carries fuel surcharges, and Jason's surcharge passes through at 100%
// (2026-11-01 audit: the +3.2% "firming" rode diesel $5.02 → $6.29).
const DIESEL_SERIES_ID = "GASDESW";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
let cache = null; // { data, fetchedAt }
let signalsCache = null; // { data: { index, diesel }, fetchedAt }

// The query for one series. Weekly series come back as monthly averages so
// every month has one point, like the PPI.
export const fredParams = (seriesId, key, monthlyAverage = false) => {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: key,
    file_type: "json",
    observation_start: "2024-01-01",
    sort_order: "asc",
  });
  if (monthlyAverage) {
    params.set("frequency", "m");
    params.set("aggregation_method", "avg");
  }
  return params;
};

const fetchSeries = async (seriesId, key, monthlyAverage = false) => {
  const res = await fetch(`${FRED_BASE}?${fredParams(seriesId, key, monthlyAverage)}`);
  if (!res.ok) throw new Error(`FRED request failed (${res.status})`);
  return parseFredSeries(await res.json());
};

// Pure: FRED observations → [{ month:'YYYY-MM', value }] ascending. FRED marks
// missing months with ".", which coerces to NaN and is skipped. Monthly
// observations are dated the 1st, so the month is the date's YYYY-MM.
export const parseFredSeries = (json) => {
  const rows = json?.observations ?? [];
  const out = [];
  for (const r of rows) {
    const date = r?.date;
    const value = Number(r?.value);
    if (!date || !Number.isFinite(value)) continue;
    out.push({ month: String(date).slice(0, 7), value });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
};

// The specialized-freight PPI as a monthly series for the barometer overlay.
// Returns [] when unconfigured or on a FRED blip, so the page degrades to just
// the owner's own rate line.
export const getFreightIndexMonthly = async () => {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;

  const key = process.env.FRED_API_KEY;
  if (!key) return []; // not configured — barometer shows only the owner's line

  const data = await fetchSeries(SERIES_ID, key);
  cache = { data, fetchedAt: now };
  return data;
};

// The index and the diesel price together. Diesel is best-effort: a blip on
// the diesel series never costs the page its index (the signal then simply
// can't tell a fuel move and says so).
export const getFreightSignals = async () => {
  const now = Date.now();
  if (signalsCache && now - signalsCache.fetchedAt < CACHE_TTL_MS) return signalsCache.data;
  const key = process.env.FRED_API_KEY;
  if (!key) return { index: [], diesel: [] };
  const index = await getFreightIndexMonthly();
  let diesel = [];
  try {
    diesel = await fetchSeries(DIESEL_SERIES_ID, key, true);
  } catch {
    diesel = [];
  }
  const data = { index, diesel };
  signalsCache = { data, fetchedAt: now };
  return data;
};
