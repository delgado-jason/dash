import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { loadGross } from "./rateTargets";

// Fuel against the money it relates to, per month. Two readings:
//   • fuelPctGross  — fuel spend as a share of gross revenue (the cost view)
//   • fscCoverage   — fuel-surcharge collected ÷ fuel spend; ≥1 means the
//                     surcharge paid for the fuel, <1 means the gap comes out
//                     of linehaul. This is the one that moves money for a BCO
//                     who keeps 100% of FSC.
export interface FuelMonth {
  month: string; // "YYYY-MM"
  fuelSpend: number; // Σ gallons × price/gal that month
  gross: number; // Σ gross revenue delivered that month
  fsc: number; // Σ fuel surcharge delivered that month
  fuelPctGross: number | null; // null when no gross that month
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

  // Gross + fuel surcharge per month, from delivered loads.
  const gross = new Map<string, number>();
  const fsc = new Map<string, number>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.delivery_date) continue;
    const k = monthKey(l.delivery_date);
    gross.set(k, (gross.get(k) ?? 0) + loadGross(l));
    fsc.set(k, (fsc.get(k) ?? 0) + (Number(l.fuel_surcharge) || 0));
  }

  // Only months with logged fuel — a month with no fuel data would read a false
  // 0%, the same trap that made the deadhead badge lie. Skip it entirely.
  const months: FuelMonth[] = [...spend.keys()]
    .filter((k) => (spend.get(k) ?? 0) > 0)
    .sort()
    .map((k) => {
      const fuelSpend = spend.get(k) ?? 0;
      const g = gross.get(k) ?? 0;
      const f = fsc.get(k) ?? 0;
      return {
        month: k,
        fuelSpend,
        gross: g,
        fsc: f,
        fuelPctGross: g > 0 ? fuelSpend / g : null,
        fscCoverage: fuelSpend > 0 ? f / fuelSpend : null,
      };
    });

  return { months, latest: months.length ? months[months.length - 1] : null };
};
