// Macro freight-rate barometer from the U.S. FRED (St. Louis Fed), fetched
// server-side so the API key never reaches the browser. Series PCU484230484230 —
// PPI by Industry: Specialized Freight (except Used Goods) Trucking, Long-Distance
// (monthly, index Dec-2003=100). Flatbed/oversize is "specialized freight," so
// this is the closest public macro read for Jason's niche. Cached in memory; the
// series only updates monthly, so there's no reason to hit FRED per page load.

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const SERIES_ID = "PCU484230484230";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
let cache = null; // { data, fetchedAt }

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

  const params = new URLSearchParams({
    series_id: SERIES_ID,
    api_key: key,
    file_type: "json",
    observation_start: "2024-01-01",
    sort_order: "asc",
  });

  const res = await fetch(`${FRED_BASE}?${params}`);
  if (!res.ok) throw new Error(`FRED request failed (${res.status})`);
  const data = parseFredSeries(await res.json());
  cache = { data, fetchedAt: now };
  return data;
};
