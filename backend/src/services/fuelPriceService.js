// National retail diesel price from the U.S. EIA, fetched server-side so the API
// key never reaches the browser. Series EMD_EPD2D_PTE_NUS_DPG — weekly U.S.
// No 2 Diesel retail price ($/gal). Cached in memory; the feed only updates once
// a week (Monday), so there is no reason to hit EIA on every page load.

const EIA_BASE = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
let cache = null; // { data, fetchedAt }

// Pure: map an EIA v2 petroleum response to our shape. `value` arrives as a
// string, so coerce it; return null when the payload has no usable row.
export const parseNationalDiesel = (json) => {
  const row = json?.response?.data?.[0];
  if (!row) return null;
  const value = Number(row.value);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    period: row.period, // 'YYYY-MM-DD' — the week the price is for
    units: row.units ?? "$/GAL",
    seriesDescription: row["series-description"] ?? null,
  };
};

export const getNationalDiesel = async () => {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;

  const key = process.env.EIA_API_KEY;
  if (!key) return null; // not configured — the page degrades gracefully

  const params = new URLSearchParams({
    frequency: "weekly",
    "data[0]": "value",
    "facets[duoarea][]": "NUS", // U.S. national
    "facets[product][]": "EPD2D", // No 2 Diesel
    "facets[process][]": "PTE", // Retail Sales
    "sort[0][column]": "period",
    "sort[0][direction]": "desc",
    length: "1", // just the most recent week
    api_key: key,
  });

  const res = await fetch(`${EIA_BASE}?${params}`);
  if (!res.ok) throw new Error(`EIA request failed (${res.status})`);
  const data = parseNationalDiesel(await res.json());
  cache = { data, fetchedAt: now };
  return data;
};
