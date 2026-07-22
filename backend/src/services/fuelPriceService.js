// National retail diesel price from the U.S. EIA, fetched server-side so the API
// key never reaches the browser. Series EMD_EPD2D_PTE_NUS_DPG — weekly U.S.
// No 2 Diesel retail price ($/gal). Cached in memory; the feed only updates once
// a week (Monday), so there is no reason to hit EIA on every page load.

const EIA_BASE = "https://api.eia.gov/v2/petroleum/pri/gnd/data/";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
let cache = null; // { data, fetchedAt }
let seriesCache = null; // { data, fetchedAt } — the monthly history

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

// Pure: EIA rows → monthly national averages, ascending by month. Each week's
// value counts once; a month's price is the mean of its weeks.
export const rollUpMonthly = (json) => {
  const rows = json?.response?.data ?? [];
  const byMonth = new Map();
  for (const r of rows) {
    const period = r?.period;
    const value = Number(r?.value);
    if (!period || !Number.isFinite(value)) continue;
    const month = String(period).slice(0, 7); // 'YYYY-MM'
    const g = byMonth.get(month) ?? { sum: 0, n: 0 };
    g.sum += value;
    g.n += 1;
    byMonth.set(month, g);
  }
  return [...byMonth.entries()]
    .map(([month, g]) => ({ month, value: g.sum / g.n }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
};

// The national diesel price as a MONTHLY series (for the you-vs-national chart).
// Pulls ~5 years of the weekly feed and rolls it up. Cached like the latest value.
export const getNationalDieselMonthly = async () => {
  const now = Date.now();
  if (seriesCache && now - seriesCache.fetchedAt < CACHE_TTL_MS)
    return seriesCache.data;

  const key = process.env.EIA_API_KEY;
  if (!key) return []; // not configured — chart shows only the owner's line

  const params = new URLSearchParams({
    frequency: "weekly",
    "data[0]": "value",
    "facets[duoarea][]": "NUS",
    "facets[product][]": "EPD2D",
    "facets[process][]": "PTE",
    "sort[0][column]": "period",
    "sort[0][direction]": "desc",
    length: "300", // ~5.7 years of weeks
    api_key: key,
  });

  const res = await fetch(`${EIA_BASE}?${params}`);
  if (!res.ok) throw new Error(`EIA request failed (${res.status})`);
  const data = rollUpMonthly(await res.json());
  seriesCache = { data, fetchedAt: now };
  return data;
};
