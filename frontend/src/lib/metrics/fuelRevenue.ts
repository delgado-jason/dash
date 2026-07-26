import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { loadRevenue } from "./rateTargets";

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
}

export interface FuelVsRevenue {
  months: FuelMonth[]; // chronological; ONLY months with logged fuel
  latest: FuelMonth | null; // most recent such month
}

const monthKey = (isoDate: string): string => isoDate.slice(0, 7); // "YYYY-MM"

export const fuelVsRevenue = (
  entries: FuelEntry[],
  loads: Load[],
): FuelVsRevenue => {
  // Fuel spend per month.
  const spend = new Map<string, number>();
  for (const e of entries) {
    if (!e.fuel_date) continue;
    const k = monthKey(e.fuel_date);
    const dollars =
      (Number(e.gallons) || 0) * (Number(e.price_per_gallon) || 0);
    spend.set(k, (spend.get(k) ?? 0) + dollars);
  }

  // Net revenue + fuel surcharge per month, from delivered loads. Net is via
  // loadRevenue (the carrier's cut already taken out) — the money the fuel is
  // actually paid from.
  const net = new Map<string, number>();
  const fsc = new Map<string, number>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.delivery_date) continue;
    const k = monthKey(l.delivery_date);
    net.set(k, (net.get(k) ?? 0) + loadRevenue(l));
    fsc.set(k, (fsc.get(k) ?? 0) + (Number(l.fuel_surcharge) || 0));
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
      return {
        month: k,
        fuelSpend,
        net: n,
        fsc: f,
        fuelPctNet: n > 0 ? fuelSpend / n : null,
        fscCoverage: fuelSpend > 0 ? f / fuelSpend : null,
      };
    });

  return { months, latest: months.length ? months[months.length - 1] : null };
};
