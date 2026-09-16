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

// The window every PRICE-bearing fuel figure reads: the last 30 days. It was
// 90 until 2026-09-16 (Jason: "a rolling 90 days is too long with fuel being
// so volatile") — diesel went $4.16 → $5.61 a gallon between June and
// September 2026, and the 90-day blend was quoting seventy cents under the
// pump. MPG is mechanical and stays lifetime; dollars follow the last month
// of receipts. The cash-flow board's weekly fuel (lib/metrics/settlements)
// has run on 30 days since 2026-09-06 — the two jobs now agree.
export const FUEL_WINDOW_DAYS = 30;

// The window's first day, inclusive — FUEL_WINDOW_DAYS back from `now`.
// fuel_date is a DATE column keyed by its day string, so the comparison is
// string-on-string and never round-trips through a local midnight.
const windowStartKey = (now: Date): string => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - FUEL_WINDOW_DAYS);
  return cutoff.toISOString().slice(0, 10);
};

export interface FuelStats {
  entryCount: number;
  totalGallons: number;
  totalSpend: number;
  avgCostPerGallon: number | null; // lifetime, every gallon ever logged
  totalMiles: number;
  avgMpg: number | null; // lifetime tank-window MPG — mechanical, not priced
  // THE canonical fuel $/mile, app-wide (Jason, 2026-08-18): tank-window
  // spend ÷ tank-window miles, restricted to windows that CLOSED in the last
  // FUEL_WINDOW_DAYS days. Fuel prices are volatile — an all-time average
  // drifts from what diesel costs today. Every surface that quotes fuel cost
  // per mile must read this one number; null = no full-to-full window closed
  // recently.
  costPerMile30: number | null;
  // The 30-day set split into its factors, so estimate surfaces can show
  // "X mpg · $Y/gal" whose quotient IS costPerMile30 — never a second rate.
  mpg30: number | null;
  avgCostPerGallon30: number | null;
  windows30: number; // tank windows closed in the last FUEL_WINDOW_DAYS days
  // What a gallon cost him lately: every fill dated inside the window, partials
  // and all, tank windows or not. This is the PRICE question (the you-vs-
  // national card, the answering line); the RATE question above stays on
  // closed windows so its factors divide back to costPerMile30. The two can
  // differ by a few cents — a partial after the last full is money spent but
  // not yet miles measured.
  paidPerGallon30: number | null;
  bestMpg: number | null;
  worstMpg: number | null;
  windows: MpgWindow[];
}

export const fuelStats = (entries: FuelLike[], now: Date): FuelStats => {
  const windows = mpgWindows(entries);
  const totalGallons = entries.reduce((s, e) => s + gal(e), 0);
  const totalSpend = entries.reduce((s, e) => s + entryCost(e), 0);
  const totalMiles = windows.reduce((s, w) => s + w.miles, 0);
  const windowGallons = windows.reduce((s, w) => s + w.gallons, 0);
  const mpgs = windows.map((w) => w.mpg);

  // Rolling $/mile — a window belongs to the day its closing full-up
  // happened, so one window can straddle the cutoff; it counts iff it closed
  // inside. Dollars and miles always come from the SAME windows.
  const startKey = windowStartKey(now);
  const recent = windows.filter((w) => String(w.date).slice(0, 10) >= startKey);
  const recentMiles = recent.reduce((s, w) => s + w.miles, 0);
  const recentSpend = recent.reduce((s, w) => s + w.cost, 0);
  const recentGallons = recent.reduce((s, w) => s + w.gallons, 0);

  // The price question: every gallon bought inside the same window.
  const recentFills = entries.filter((e) => String(e.fuel_date).slice(0, 10) >= startKey);
  const recentFillGallons = recentFills.reduce((s, e) => s + gal(e), 0);
  const recentFillSpend = recentFills.reduce((s, e) => s + entryCost(e), 0);

  return {
    entryCount: entries.length,
    totalGallons,
    totalSpend,
    avgCostPerGallon: totalGallons > 0 ? totalSpend / totalGallons : null,
    totalMiles,
    avgMpg: windowGallons > 0 ? totalMiles / windowGallons : null,
    costPerMile30: recentMiles > 0 ? recentSpend / recentMiles : null,
    mpg30: recentGallons > 0 ? recentMiles / recentGallons : null,
    avgCostPerGallon30: recentGallons > 0 ? recentSpend / recentGallons : null,
    windows30: recent.length,
    paidPerGallon30: recentFillGallons > 0 ? recentFillSpend / recentFillGallons : null,
    bestMpg: mpgs.length ? Math.max(...mpgs) : null,
    worstMpg: mpgs.length ? Math.min(...mpgs) : null,
    windows,
  };
};

// A recap of the most recently COMPLETED tank (the latest full-to-full window),
// scored against his own history — the "how did my last fill-up do?" card. All
// deltas are signed so the UI colors them: MPG up is good, cost/mile and price
// under national are good. Returns null until at least one full tank has closed.
export interface TankRecap {
  tank: MpgWindow; // the latest completed tank
  costPerMile: number; // this tank's fuel $/mile
  pricePerGallon: number; // this tank's blended $/gal
  mpgVsAvg: number | null; // tank MPG − overall avg MPG (+ = better)
  mpgVsLast: number | null; // tank MPG − previous tank's MPG (+ = better)
  cpmVsAvg: number | null; // tank $/mile − 30-day $/mile (− = better/cheaper)
  ppgVsNational: number | null; // tank $/gal − national that month (− = under market)
  isRecord: boolean; // strictly beat every prior tank's MPG (needs a prior)
  streak: number; // consecutive most-recent tanks at/above avg MPG
}

export const latestTankRecap = (
  stats: FuelStats,
  national: { month: string; value: number }[],
): TankRecap | null => {
  const w = stats.windows;
  if (w.length === 0) return null;

  const tank = w[w.length - 1];
  const prior = w.length >= 2 ? w[w.length - 2] : null;
  const costPerMile = tank.cost / tank.miles;
  const pricePerGallon = tank.cost / tank.gallons;

  const mpgVsAvg = stats.avgMpg != null ? tank.mpg - stats.avgMpg : null;
  const mpgVsLast = prior ? tank.mpg - prior.mpg : null;
  // The latest tank is itself IN the 30-day set — when it's the only member,
  // the "average" is just this tank and the delta is a vacuous $0.00. Null it
  // so the card says "no average yet" instead of a green on-par stamp.
  const cpmVsAvg =
    stats.costPerMile30 != null && stats.windows30 > 1
      ? costPerMile - stats.costPerMile30
      : null;

  // National price for the tank's month (best-effort — null when EIA has none).
  const month = String(tank.date).slice(0, 7);
  const nat = national.find((n) => n.month === month);
  const ppgVsNational = nat ? pricePerGallon - nat.value : null;

  // A record only counts if it strictly beats every earlier tank — so the very
  // first tank is never a "record", and a tie doesn't re-trigger it.
  const priorBest = prior
    ? Math.max(...w.slice(0, -1).map((x) => x.mpg))
    : null;
  const isRecord = priorBest != null && tank.mpg > priorBest;

  // How many of the most-recent tanks, unbroken, ran at or above the average.
  let streak = 0;
  if (stats.avgMpg != null) {
    for (let i = w.length - 1; i >= 0; i--) {
      if (w[i].mpg >= stats.avgMpg) streak++;
      else break;
    }
  }

  return {
    tank,
    costPerMile,
    pricePerGallon,
    mpgVsAvg,
    mpgVsLast,
    cpmVsAvg,
    ppgVsNational,
    isRecord,
    streak,
  };
};

// Gallon-weighted average price/gallon per calendar month, ascending — his own
// line on the you-vs-national diesel chart.
export interface MonthPrice {
  month: string; // 'YYYY-MM'
  avgPrice: number;
}
export const monthlyFuelPrice = (entries: FuelLike[]): MonthPrice[] => {
  const byMonth = new Map<string, { cost: number; gallons: number }>();
  for (const e of entries) {
    const month = String(e.fuel_date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const g = byMonth.get(month) ?? { cost: 0, gallons: 0 };
    g.cost += entryCost(e);
    g.gallons += gal(e);
    byMonth.set(month, g);
  }
  return [...byMonth.entries()]
    .filter(([, g]) => g.gallons > 0)
    .map(([month, g]) => ({ month, avgPrice: g.cost / g.gallons }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
};

const fmtMonth = (m: string): string => {
  const [y, mo] = m.split("-");
  return new Date(Date.UTC(Number(y), Number(mo) - 1, 1)).toLocaleDateString(
    "en-US",
    { month: "short", year: "2-digit", timeZone: "UTC" },
  );
};

// Chart rows over every month he fueled: his avg $/gal + the national price for
// that month (null when EIA has no value there).
export interface DieselMonth {
  month: string;
  label: string; // "Jul '26"
  you: number;
  national: number | null;
}
export const dieselChartData = (
  entries: FuelLike[],
  national: { month: string; value: number }[],
): DieselMonth[] => {
  const nat = new Map(national.map((n) => [n.month, n.value]));
  return monthlyFuelPrice(entries).map(({ month, avgPrice }) => ({
    month,
    label: fmtMonth(month),
    you: avgPrice,
    national: nat.get(month) ?? null,
  }));
};

// Highest odometer reading across fill-ups (or null if none) — the fuel log is
// usually the freshest odometer source, so it folds into the truck's derived
// "latest odometer" alongside loads and service readings.
export const maxFuelOdometer = (
  entries: { odometer_reading: number }[],
): number | null =>
  entries.reduce<number | null>(
    (m, e) => (m == null || e.odometer_reading > m ? e.odometer_reading : m),
    null,
  );
