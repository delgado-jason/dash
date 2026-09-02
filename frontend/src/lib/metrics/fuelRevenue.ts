import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { loadRevenue } from "./rateTargets";

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
// PEG NOTE: 1.25 is the industry-typical DOE base — verify the exact number
// against the Landstar FSC schedule (ICOA appendix) and correct it here.
export const FSC_PEG = 1.25; // $/gal the surcharge does NOT cover
export const FSC_BASE_MPG = 6.0; // the schedule's assumed MPG

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
  // The month's honest coverage bar (see FSC STANDARD above); null when the
  // month lacks gallons or driven miles to compute it.
  expectedCoverage: number | null;
}

export interface FuelVsRevenue {
  months: FuelMonth[]; // chronological; ONLY months with logged fuel
  latest: FuelMonth | null; // most recent such month
}

const monthKey = (isoDate: string): string => isoDate.slice(0, 7); // "YYYY-MM"

export const fuelVsRevenue = (
  entries: FuelEntry[],
  loads: Load[],
  // Lifetime tank-window MPG (fuelStats.avgMpg) — the schedule's bonus term.
  // null → the term drops to 1 (no bonus claimed without data).
  avgMpg: number | null = null,
): FuelVsRevenue => {
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
    if (l.load_status !== "delivered" || !l.delivery_date) continue;
    const k = monthKey(l.delivery_date);
    net.set(k, (net.get(k) ?? 0) + loadRevenue(l));
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
      const expectedCoverage =
        ppg != null && ppg > FSC_PEG && loadedShare != null
          ? ((ppg - FSC_PEG) / ppg) * loadedShare * mpgBonus
          : null;
      return {
        month: k,
        fuelSpend,
        net: n,
        fsc: f,
        fuelPctNet: n > 0 ? fuelSpend / n : null,
        fscCoverage: fuelSpend > 0 ? f / fuelSpend : null,
        expectedCoverage,
      };
    });

  return { months, latest: months.length ? months[months.length - 1] : null };
};
