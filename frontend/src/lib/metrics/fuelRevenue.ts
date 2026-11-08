import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import type { FscSchedule } from "@/types/fscSchedule";
import { loadNetRevenue } from "./rateTargets";
import { isDelivered } from "./status";
import { bandFor, scheduleInForce, type FscPar } from "./fscTable";

// THE FSC STANDARD (Jason, 2026-09-03). A fuel surcharge is NOT designed to
// cover 100% of fuel — it pays the price ABOVE a contract peg, on LOADED
// miles only. The owner eats the first ~peg dollars of every gallon and every
// deadhead mile BY DESIGN, so grading coverage against 100% shows red
// forever. The honest bar, per month:
//
//   expected = (price − peg)/price × (loaded ÷ driven) × (your MPG ÷ base MPG)
//
// price = that month's blended $/gal; peg = the FSC schedule's base price;
// base MPG = the schedule's divisor (industry convention 6.0); your MPG above
// base is a real bonus (the schedule pays as if you burned more than you do).
// FITTED 2026-11-08 (FSC-01) from Landstar's Ranger fuel surcharge report
// effective 11/03/26–11/09/26, which prints the scale's output at four prices
// (national $6.292 → 86¢; PADD 1A $6.416 → 88¢; PADD 4 $6.445 → 89¢; PADD 5
// $7.272 → $1.03): cents per mile = (price − peg) ÷ base mpg, rounded to the
// cent, fits all four with peg 1.04–1.55 and base 5.53–6.08; the centre is
// $1.29 at 5.81 mpg. The old $1.25 / 6.0 read 84¢ where Landstar paid 86¢.
// A pasted table (fscTable.ts) beats this estimate whenever one is in force.
export const FSC_PEG = 1.29; // $/gal the surcharge does NOT cover
export const FSC_BASE_MPG = 5.81; // the schedule's assumed MPG

// Fuel against the money it relates to, per month. Two readings:
//   • fuelPctNet   — fuel spend as a share of NET revenue (what the business
//                    actually keeps after the carrier's cut). Net is the honest
//                    denominator: fuel is paid out of net, not out of the full
//                    customer rate that includes Landstar's slice.
//   • fscCoverage  — fuel-surcharge collected ÷ fuel spend; ≥1 means the
//                    surcharge paid for the fuel, <1 means the gap comes out
//                    of linehaul. This is the one that moves money for a BCO
//                    who keeps 100% of FSC.
export interface FuelMonth {
  month: string; // "YYYY-MM"
  fuelSpend: number; // Σ gallons × price/gal that month
  net: number; // Σ net revenue delivered that month (after the carrier's cut)
  fsc: number; // Σ fuel surcharge delivered that month
  fuelPctNet: number | null; // null when no net that month
  fscCoverage: number | null; // null when no fuel that month (never shown then)
  // The month's honest coverage bar; null when it cannot be computed.
  // With a pasted Landstar table in force (GL-155): loaded miles × the band's
  // ¢/mi at the month's national diesel price, over the fuel spend. Without
  // one: the peg estimate above. `par` says which, and why when neither.
  expectedCoverage: number | null;
  par: FscPar;
}

// What a month's par is read from when Landstar's table is on file (GL-155):
// the pasted tables, the EIA national average per month ("YYYY-MM" → $/gal)
// and this week's price for the month still running.
export interface FscParInputs {
  schedules: FscSchedule[];
  dieselByMonth: Map<string, number>;
  latestDiesel: { price: number; period: string } | null;
}

export interface FuelVsRevenue {
  months: FuelMonth[]; // chronological; ONLY months with logged fuel
  latest: FuelMonth | null; // most recent such month (may be the running one)
  // What the card LEADS with: the last COMPLETE month with logged fuel (on
  // Nov 7, October). A month one fill old would read 27% vs 70% and mean
  // nothing. Falls back to the running month only when it is the sole month.
  headline: FuelMonth | null;
  // The running month, shown as a "so far" line beneath the headline — null
  // when it has no logged fuel yet, or when it IS the headline.
  soFar: FuelMonth | null;
}

// "YYYY-MM" of `now` (local calendar month).
const currentMonthKey = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

// The headline / so-far pick, pure on the month list so it can be tested alone.
export const pickFscMonths = (
  months: FuelMonth[],
  now: Date,
): { headline: FuelMonth | null; soFar: FuelMonth | null } => {
  const cur = currentMonthKey(now);
  const complete = months.filter((m) => m.month < cur);
  const running = months.find((m) => m.month === cur) ?? null;
  if (complete.length === 0) return { headline: running, soFar: null };
  return { headline: complete[complete.length - 1], soFar: running };
};

const monthKey = (isoDate: string): string => isoDate.slice(0, 7); // "YYYY-MM"

// "Sep 2026" from "2026-09" (UTC, never shifts).
const monthWords = (k: string): string =>
  new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// One month's par. A table in force that month (by its first day) beats the
// peg estimate: expected FSC = loaded miles × the band's ¢/mi at the month's
// national diesel price (this week's price for the running month), and the
// coverage bar is that over the fuel spend. A table with no price for the
// month, or a price below the table's first band, is UNKNOWN — the card says
// why rather than falling back to the estimate behind the table's name.
const monthPar = (a: {
  month: string;
  running: boolean;
  fuelSpend: number;
  loaded: number;
  ppg: number | null;
  loadedShare: number | null;
  mpgBonus: number;
  fsc: FscParInputs | null;
}): { expectedCoverage: number | null; par: FscPar } => {
  const table = a.fsc ? scheduleInForce(a.fsc.schedules, `${a.month}-01`) : null;
  if (!table) {
    const expectedCoverage =
      a.ppg != null && a.ppg > FSC_PEG && a.loadedShare != null
        ? ((a.ppg - FSC_PEG) / a.ppg) * a.loadedShare * a.mpgBonus
        : null;
    return { expectedCoverage, par: { kind: "estimate" } };
  }
  const weekly = a.running && a.fsc?.latestDiesel ? a.fsc.latestDiesel.price : null;
  const monthly = a.fsc?.dieselByMonth.get(a.month) ?? null;
  const price = weekly ?? monthly;
  if (price == null)
    return { expectedCoverage: null, par: { kind: "unknown", reason: `no national diesel price for ${monthWords(a.month)}` } };
  const band = bandFor(table.bands, price);
  if (!band)
    return {
      expectedCoverage: null,
      par: { kind: "unknown", reason: `$${price.toFixed(3)} is below the table's first band` },
    };
  const expectedFsc = a.loaded * band.cpm;
  return {
    expectedCoverage: a.fuelSpend > 0 ? expectedFsc / a.fuelSpend : null,
    par: {
      kind: "table",
      effective_from: table.effective_from,
      price,
      priceIsThisWeek: weekly != null,
      cpm: band.cpm,
      expectedFsc,
    },
  };
};

export const fuelVsRevenue = (
  entries: FuelEntry[],
  loads: Load[],
  // Lifetime tank-window MPG (fuelStats.avgMpg) — the schedule's bonus term.
  // null → the term drops to 1 (no bonus claimed without data).
  avgMpg: number | null = null,
  now: Date = new Date(),
  fscPar: FscParInputs | null = null,
): FuelVsRevenue => {
  const cur = currentMonthKey(now);
  // Fuel spend + gallons per month.
  const spend = new Map<string, number>();
  const gallons = new Map<string, number>();
  for (const e of entries) {
    if (!e.fuel_date) continue;
    const k = monthKey(e.fuel_date);
    const gal = Number(e.gallons) || 0;
    const dollars = gal * (Number(e.price_per_gallon) || 0);
    spend.set(k, (spend.get(k) ?? 0) + dollars);
    gallons.set(k, (gallons.get(k) ?? 0) + gal);
  }

  // Net revenue + fuel surcharge per month, from delivered loads. Net is via
  // loadRevenue (the carrier's cut already taken out) — the money the fuel is
  // actually paid from.
  const net = new Map<string, number>();
  const fsc = new Map<string, number>();
  const loaded = new Map<string, number>();
  const driven = new Map<string, number>();
  for (const l of loads) {
    if (!isDelivered(l) || !l.delivery_date) continue;
    const k = monthKey(l.delivery_date);
    net.set(k, (net.get(k) ?? 0) + loadNetRevenue(l));
    fsc.set(k, (fsc.get(k) ?? 0) + (Number(l.fuel_surcharge) || 0));
    loaded.set(k, (loaded.get(k) ?? 0) + (Number(l.loaded_miles) || 0));
    const odo =
      l.odometer_end != null && l.odometer_start != null
        ? Number(l.odometer_end) - Number(l.odometer_start)
        : 0;
    const drv = odo > 0 ? odo : (Number(l.loaded_miles) || 0) + (Number(l.deadhead_miles) || 0);
    driven.set(k, (driven.get(k) ?? 0) + drv);
  }

  // Only months with logged fuel — a month with no fuel data would read a false
  // 0%, the same trap that made the deadhead badge lie. Skip it entirely.
  const months: FuelMonth[] = [...spend.keys()]
    .filter((k) => (spend.get(k) ?? 0) > 0)
    .sort()
    .map((k) => {
      const fuelSpend = spend.get(k) ?? 0;
      const n = net.get(k) ?? 0;
      const f = fsc.get(k) ?? 0;
      const gal = gallons.get(k) ?? 0;
      const ppg = gal > 0 ? fuelSpend / gal : null;
      const ld = loaded.get(k) ?? 0;
      const dr = driven.get(k) ?? 0;
      const loadedShare = dr > 0 ? ld / dr : null;
      const mpgBonus = avgMpg != null && avgMpg > 0 ? avgMpg / FSC_BASE_MPG : 1;
      const { expectedCoverage, par } = monthPar({
        month: k,
        running: k === cur,
        fuelSpend,
        loaded: ld,
        ppg,
        loadedShare,
        mpgBonus,
        fsc: fscPar,
      });
      return {
        month: k,
        fuelSpend,
        net: n,
        fsc: f,
        fuelPctNet: n > 0 ? fuelSpend / n : null,
        fscCoverage: fuelSpend > 0 ? f / fuelSpend : null,
        expectedCoverage,
        par,
      };
    });

  return {
    months,
    latest: months.length ? months[months.length - 1] : null,
    ...pickFscMonths(months, now),
  };
};
