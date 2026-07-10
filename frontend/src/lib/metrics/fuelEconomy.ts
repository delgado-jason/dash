// Fuel-page economy math. A fill-up of 120+ gallons is a FULL tank; anything
// less is a PARTIAL that rolls into the next full. MPG is measured between
// fulls: miles ÷ every gallon added since the previous full.
export const FULL_THRESHOLD = 120;

interface FuelLike {
  gallons: number | string; // Postgres numeric → string
  price_per_gallon: number | string;
  odometer_reading: number;
  fuel_date: string; // 'YYYY-MM-DD'
}

const gal = (e: FuelLike) => Number(e.gallons);
const ppg = (e: FuelLike) => Number(e.price_per_gallon);
export const entryCost = (e: FuelLike): number => gal(e) * ppg(e);
export const isFull = (e: FuelLike): boolean => gal(e) >= FULL_THRESHOLD;

export interface MpgWindow {
  toOdometer: number;
  date: string; // the closing full's date
  miles: number;
  gallons: number;
  cost: number;
  mpg: number;
}

// One window per full tank: gallons = partials since the last full + this full.
export const mpgWindows = (entries: FuelLike[]): MpgWindow[] => {
  const sorted = [...entries].sort(
    (a, b) => a.odometer_reading - b.odometer_reading,
  );
  const windows: MpgWindow[] = [];
  let open: FuelLike | null = null;
  let gallons = 0;
  let cost = 0;
  for (const e of sorted) {
    if (!open) {
      // Nothing counts until the first full tank establishes a baseline.
      if (isFull(e)) {
        open = e;
        gallons = 0;
        cost = 0;
      }
      continue;
    }
    gallons += gal(e);
    cost += entryCost(e);
    if (isFull(e)) {
      const miles = e.odometer_reading - open.odometer_reading;
      if (miles > 0 && gallons > 0) {
        windows.push({
          toOdometer: e.odometer_reading,
          date: e.fuel_date,
          miles,
          gallons,
          cost,
          mpg: miles / gallons,
        });
      }
      open = e;
      gallons = 0;
      cost = 0;
    }
  }
  return windows;
};

export interface FuelStats {
  entryCount: number;
  totalGallons: number;
  totalSpend: number;
  avgCostPerGallon: number | null;
  totalMiles: number;
  avgMpg: number | null;
  costPerMile: number | null;
  bestMpg: number | null;
  worstMpg: number | null;
  avgWeeklyCost90: number | null;
  windows: MpgWindow[];
}

// Rolling-90-day average weekly fuel cost. Divides by the actual span of data
// in the window (7–90 days) so it reads as the real weekly rate before there's
// a full 90 days of history, converging to the strict 90-day average after.
export const avgWeeklyCost = (
  entries: FuelLike[],
  now: Date,
): number | null => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const inWindow = entries.filter((e) => e.fuel_date.slice(0, 10) >= cutoffStr);
  if (inWindow.length === 0) return null;

  const spend = inWindow.reduce((s, e) => s + entryCost(e), 0);
  const earliest = inWindow.reduce(
    (min, e) => (e.fuel_date < min ? e.fuel_date : min),
    inWindow[0].fuel_date,
  );
  const days = Math.max(
    7,
    Math.min(
      90,
      Math.round(
        (now.getTime() - new Date(earliest.slice(0, 10) + "T00:00:00Z").getTime()) /
          86_400_000,
      ),
    ),
  );
  return spend / (days / 7);
};

export const fuelStats = (entries: FuelLike[], now: Date): FuelStats => {
  const windows = mpgWindows(entries);
  const totalGallons = entries.reduce((s, e) => s + gal(e), 0);
  const totalSpend = entries.reduce((s, e) => s + entryCost(e), 0);
  const totalMiles = windows.reduce((s, w) => s + w.miles, 0);
  const windowGallons = windows.reduce((s, w) => s + w.gallons, 0);
  const windowSpend = windows.reduce((s, w) => s + w.cost, 0);
  const mpgs = windows.map((w) => w.mpg);
  return {
    entryCount: entries.length,
    totalGallons,
    totalSpend,
    avgCostPerGallon: totalGallons > 0 ? totalSpend / totalGallons : null,
    totalMiles,
    avgMpg: windowGallons > 0 ? totalMiles / windowGallons : null,
    costPerMile: totalMiles > 0 ? windowSpend / totalMiles : null,
    bestMpg: mpgs.length ? Math.max(...mpgs) : null,
    worstMpg: mpgs.length ? Math.min(...mpgs) : null,
    avgWeeklyCost90: avgWeeklyCost(entries, now),
    windows,
  };
};

export interface WeekCost {
  weekStart: string; // Monday, 'YYYY-MM-DD'
  cost: number;
}

// Fuel spend bucketed by ISO week (Monday start), oldest first — for the chart.
export const weeklyCostSeries = (entries: FuelLike[]): WeekCost[] => {
  const buckets = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.fuel_date.slice(0, 10) + "T00:00:00Z");
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + entryCost(e));
  }
  return [...buckets.entries()]
    .map(([weekStart, cost]) => ({ weekStart, cost }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
};
