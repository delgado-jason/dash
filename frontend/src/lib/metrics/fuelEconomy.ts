// Fuel-page economy math. A fill is FULL when Jason said so — filled_to_top,
// ticked by default on the fill-up form (GL-154, 2026-11-05; General Items
// mock 2, nodded 2026-11-07). Anything else is a PARTIAL that rolls into the
// next full. MPG is measured between fulls: miles ÷ every gallon added since
// the previous full. Before this the rule was a guess, 120 gallons or more;
// migration 093 backfilled every older fill by that rule, so history reads
// exactly as it did. LEGACY_FULL_GALLONS is that backfill rule, kept only so
// the Guide and the migration agree — the math never reads it.
export const LEGACY_FULL_GALLONS = 120;

interface FuelLike {
  gallons: number | string; // Postgres numeric → string
  price_per_gallon: number | string;
  odometer_reading: number;
  fuel_date: string; // 'YYYY-MM-DD'
  filled_to_top: boolean; // his word — the only thing that closes a window
  // diesel | def (migration 113; the Fuel page sheet, call 6, nodded
  // 2026-11-15). Absent on older callers and fixtures = diesel. A DEF fill
  // carries gallons and a total and never a tank window: it is out of MPG and
  // out of every $/gal, and in the cost per mile the way it leaves the pocket.
  kind?: string | null;
}

const gal = (e: FuelLike) => Number(e.gallons);
const ppg = (e: FuelLike) => Number(e.price_per_gallon);
export const entryCost = (e: FuelLike): number => gal(e) * ppg(e);
export const isDef = (e: { kind?: string | null }): boolean => e.kind === "def";
// A DEF fill never closes a tank, whatever its tick says — the database
// refuses the pair (fuel_entries_def_never_full); this is the belt.
export const isFull = (e: FuelLike): boolean => e.filled_to_top === true && !isDef(e);

export interface MpgWindow {
  toOdometer: number;
  date: string; // the closing full's date
  miles: number;
  gallons: number; // diesel — the gallons the miles were driven on
  cost: number; // the diesel dollars
  // DEF bought inside the window. It rides the pocket's cost per mile and
  // never the MPG or the price per gallon.
  defCost: number;
  mpg: number;
}

// One window per full tank: gallons = partials since the last full + this full.
// A DEF fill between two fulls adds its dollars to the window and nothing else;
// one after the last full waits for the next window, as a partial does.
export const mpgWindows = (entries: FuelLike[]): MpgWindow[] => {
  const sorted = [...entries].sort(
    (a, b) => a.odometer_reading - b.odometer_reading,
  );
  const windows: MpgWindow[] = [];
  let open: FuelLike | null = null;
  let gallons = 0;
  let cost = 0;
  let defCost = 0;
  for (const e of sorted) {
    if (!open) {
      // Nothing counts until the first full tank establishes a baseline.
      if (isFull(e)) {
        open = e;
        gallons = 0;
        cost = 0;
        defCost = 0;
      }
      continue;
    }
    if (isDef(e)) {
      defCost += entryCost(e);
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
          defCost,
          mpg: miles / gallons,
        });
      }
      open = e;
      gallons = 0;
      cost = 0;
      defCost = 0;
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

// The window's first day, inclusive: today and the FUEL_WINDOW_DAYS − 1 days
// before it — thirty days, not thirty-one (it ran a day long, and in UTC,
// until 2026-11-04: the Oct 5 fill was in this window and out of the board's).
// Callers hand in the operator's LOCAL day (today.ts); fuel_date is a DATE
// column keyed by its day string, so the comparison is string-on-string and
// never round-trips through a local midnight.
const windowStartKey = (now: Date): string => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (FUEL_WINDOW_DAYS - 1));
  return cutoff.toISOString().slice(0, 10);
};

export interface FuelStats {
  entryCount: number; // every row on the log, DEF included
  defCount: number;
  totalGallons: number; // diesel — DEF is not fuel burned
  totalSpend: number; // every dollar at the pump, diesel and DEF
  dieselSpend: number;
  defGallons: number;
  defSpend: number;
  avgCostPerGallon: number | null; // lifetime diesel $/gal, every diesel gallon ever logged
  totalMiles: number;
  avgMpg: number | null; // lifetime tank-window MPG — mechanical, not priced
  // THE canonical fuel $/mile, app-wide (Jason, 2026-08-18): tank-window
  // spend ÷ tank-window miles, restricted to windows that CLOSED in the last
  // FUEL_WINDOW_DAYS days. Fuel prices are volatile — an all-time average
  // drifts from what diesel costs today. Every surface that quotes fuel cost
  // per mile must read this one number; null = no full-to-full window closed
  // recently. Since 2026-11-15 the spend is diesel AND the DEF bought inside
  // those windows — what the miles cost the pocket.
  costPerMile30: number | null;
  // The DEF share of costPerMile30: a true 0 when no DEF was bought in the
  // recent windows, null when there is no recent window to read.
  defPerMile30: number | null;
  // The 30-day set split into its DIESEL factors, so estimate surfaces can
  // show "X mpg · $Y/gal". Their quotient is the diesel cost per mile —
  // costPerMile30 less defPerMile30 — never a second rate.
  mpg30: number | null;
  avgCostPerGallon30: number | null;
  windows30: number; // tank windows closed in the last FUEL_WINDOW_DAYS days
  // What a gallon of diesel cost him lately: every diesel fill dated inside
  // the window, partials and all, tank windows or not. This is the PRICE
  // question (the you-vs-national table, the answering line); the RATE
  // question above stays on closed windows so its factors divide back. The
  // two can differ by a few cents — a partial after the last full is money
  // spent but not yet miles measured.
  paidPerGallon30: number | null;
  bestMpg: number | null;
  worstMpg: number | null;
  windows: MpgWindow[];
}

export const fuelStats = (entries: FuelLike[], now: Date): FuelStats => {
  const windows = mpgWindows(entries);
  const diesel = entries.filter((e) => !isDef(e));
  const defs = entries.filter(isDef);
  const totalGallons = diesel.reduce((s, e) => s + gal(e), 0);
  const dieselSpend = diesel.reduce((s, e) => s + entryCost(e), 0);
  const defGallons = defs.reduce((s, e) => s + gal(e), 0);
  const defSpend = defs.reduce((s, e) => s + entryCost(e), 0);
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
  const recentDef = recent.reduce((s, w) => s + w.defCost, 0);
  const recentGallons = recent.reduce((s, w) => s + w.gallons, 0);

  // The price question: every diesel gallon bought inside the same window.
  const recentFills = diesel.filter((e) => String(e.fuel_date).slice(0, 10) >= startKey);
  const recentFillGallons = recentFills.reduce((s, e) => s + gal(e), 0);
  const recentFillSpend = recentFills.reduce((s, e) => s + entryCost(e), 0);

  return {
    entryCount: entries.length,
    defCount: defs.length,
    totalGallons,
    totalSpend: dieselSpend + defSpend,
    dieselSpend,
    defGallons,
    defSpend,
    avgCostPerGallon: totalGallons > 0 ? dieselSpend / totalGallons : null,
    totalMiles,
    avgMpg: windowGallons > 0 ? totalMiles / windowGallons : null,
    costPerMile30: recentMiles > 0 ? (recentSpend + recentDef) / recentMiles : null,
    defPerMile30: recentMiles > 0 ? recentDef / recentMiles : null,
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
// read against his own history — the Fuel page's last-tank sentence. All
// deltas are signed: MPG up is good, cost/mile and price under national are
// good. Returns null until at least one full tank has closed.
export interface TankRecap {
  tank: MpgWindow; // the latest completed tank
  costPerMile: number; // this tank's $/mile — its diesel and the DEF bought inside it
  pricePerGallon: number; // this tank's blended diesel $/gal
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
  const costPerMile = (tank.cost + tank.defCost) / tank.miles;
  const pricePerGallon = tank.cost / tank.gallons;

  const mpgVsAvg = stats.avgMpg != null ? tank.mpg - stats.avgMpg : null;
  const mpgVsLast = prior ? tank.mpg - prior.mpg : null;
  // The latest tank is itself IN the 30-day set — when it's the only member,
  // the "average" is just this tank and the delta is a vacuous $0.00. Null it
  // so the sentence says "no average yet" instead of a vacuous on-par.
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

// Gallon-weighted average DIESEL price per calendar month, ascending — his own
// line on the you-vs-national diesel chart. DEF is not diesel and is left out.
export interface MonthPrice {
  month: string; // 'YYYY-MM'
  avgPrice: number;
}
export const monthlyFuelPrice = (entries: FuelLike[]): MonthPrice[] => {
  const byMonth = new Map<string, { cost: number; gallons: number }>();
  for (const e of entries) {
    if (isDef(e)) continue;
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

// You vs the national as numbers, newest month first — the table beside the
// chart (the Fuel page sheet, call 3). `under` is the EIA's monthly average
// less what you paid: positive = you bought under the national; null = the
// EIA has no figure for the month.
export interface PriceVsNationalRow extends DieselMonth {
  under: number | null;
}
export const priceVsNational = (
  entries: FuelLike[],
  national: { month: string; value: number }[],
): PriceVsNationalRow[] =>
  dieselChartData(entries, national)
    .map((r) => ({ ...r, under: r.national == null ? null : r.national - r.you }))
    .reverse();

// The one sentence the table earns: how the months the EIA has priced went.
export const nationalVerdict = (rows: PriceVsNationalRow[]): string | null => {
  const priced = rows.filter((r) => r.under != null);
  if (priced.length === 0) return null;
  const over = priced.filter((r) => (r.under as number) < 0).length;
  if (priced.length === 1)
    return over ? "over the national in the one month the EIA has priced" : "under the national in the one month the EIA has priced";
  if (over === 0) return "under the national every month since the log began";
  if (over === priced.length) return "over the national every month since the log began";
  return `over the national in ${over} of ${priced.length} months`;
};

// The newest reading on the log — what the fill-up form says in its odometer
// box before you type ("last 614,438 on Nov 14"). Newest by day, then the
// higher reading on a day with two stops.
export interface LastReading {
  odometer: number;
  date: string;
}
export const lastReading = (
  entries: { odometer_reading: number; fuel_date: string }[],
): LastReading | null => {
  let best: LastReading | null = null;
  for (const e of entries) {
    const date = String(e.fuel_date).slice(0, 10);
    if (
      best == null ||
      date > best.date ||
      (date === best.date && e.odometer_reading > best.odometer)
    )
      best = { odometer: e.odometer_reading, date };
  }
  return best;
};

// The newest APU meter reading taken at a pump, for the form's APU box.
export const lastApuReading = (
  entries: { apu_hours?: number | null; fuel_date: string }[],
): { hours: number; date: string } | null => {
  let best: { hours: number; date: string } | null = null;
  for (const e of entries) {
    if (e.apu_hours == null) continue;
    const date = String(e.fuel_date).slice(0, 10);
    if (best == null || date > best.date || (date === best.date && e.apu_hours > best.hours))
      best = { hours: e.apu_hours, date };
  }
  return best;
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
