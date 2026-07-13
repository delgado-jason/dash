// Truck-flavored awards — a distinct catalog from the driver's revenue feats. The
// truck earns on fuel economy, mileage, and per-mile efficiency. Same engines:
// adaptive ratcheting bars for the patches, fixed tiers for the medals.
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { mpgWindows } from "@/lib/metrics/fuelEconomy";
import { computeStack } from "./adaptiveBar";
import { tiered, type Medal } from "./medals";
import type { Patch } from "./patches";

const loadMiles = (l: Load): number => {
  const odo =
    l.odometer_end != null && l.odometer_start != null
      ? Number(l.odometer_end) - Number(l.odometer_start)
      : 0;
  return odo > 0 ? odo : Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0);
};
const monthKey = (iso: string): string => iso.slice(0, 7);
const num = (n: number) => Math.round(n).toLocaleString("en-US");

const delivered = (loads: Load[]): Load[] =>
  loads
    .filter((l) => l.load_status === "delivered" && l.delivery_date)
    .sort((a, b) => (a.delivery_date! < b.delivery_date! ? -1 : 1));

// Chronological monthly series → one value per month, in time order.
const byMonth = (loads: Load[], reduce: (ls: Load[]) => number): number[] => {
  const map = new Map<string, Load[]>();
  for (const l of loads) {
    const k = monthKey(l.delivery_date!);
    (map.get(k) ?? map.set(k, []).get(k)!).push(l);
  }
  return [...map.keys()].sort().map((k) => reduce(map.get(k)!));
};

export const computeTruckPatches = (truckLoads: Load[], truckFuel: FuelEntry[]): Patch[] => {
  const dl = delivered(truckLoads);
  const windows = mpgWindows(truckFuel); // already chronological (by closing fill)
  const out: Patch[] = [];

  // Feather Foot — a tank clearing your top MPG bar.
  const mpgs = windows.map((w) => w.mpg).filter((m) => m > 0);
  const ff = computeStack(mpgs, { n: 5, floor: 6.8 });
  out.push({ key: "feather-foot", name: "Feather Foot", icon: "feather", count: ff.count, bar: ff.bar, unit: null, hint: `tank over ${ff.bar.toFixed(1)} mpg` });

  // Iron Horse — a workhorse month of miles.
  const monthMiles = byMonth(dl, (ls) => ls.reduce((s, l) => s + loadMiles(l), 0));
  const ih = computeStack(monthMiles, { n: 5, floor: 8000 });
  out.push({ key: "iron-horse", name: "Iron Horse", icon: "road", count: ih.count, bar: ih.bar, unit: "miles", hint: `${num(ih.bar)}+ mi month` });

  // Marathon — one of your longest single hauls.
  const hauls = dl.map((l) => Number(l.loaded_miles) || 0).filter((m) => m > 0);
  const mar = computeStack(hauls, { n: 5, floor: 1200 });
  out.push({ key: "marathon", name: "Marathon", icon: "flag", count: mar.count, bar: mar.bar, unit: "miles", hint: `${num(mar.bar)}+ mi haul` });

  // Thrifty — a tank under your best fuel cost per mile.
  const costPerMi = windows.filter((w) => w.miles > 0).map((w) => w.cost / w.miles);
  const th = computeStack(costPerMi, { n: 5, floor: 0.6, lowerIsBetter: true });
  out.push({ key: "thrifty", name: "Thrifty", icon: "coins", count: th.count, bar: th.bar, unit: "money", hint: `tank under $${th.bar.toFixed(2)}/mi` });

  return out;
};

export interface TruckMedalData {
  odometer: number;
  avgMpg: number | null;
  deliveredCount: number;
  loanPaidPct: number | null; // truck payoff
}

export const computeTruckMedals = (d: TruckMedalData): Medal[] => {
  const medals: Medal[] = [
    tiered("mile-club", "Mile Club", "medal", [100_000, 250_000, 500_000, 1_000_000], d.odometer, (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)}M` : `${Math.round(n / 1000)}k`)),
    tiered("workhorse", "Workhorse", "stack-2", [100, 250, 500], d.deliveredCount, (n) => `${Math.round(n)}`),
  ];
  if (d.avgMpg != null)
    medals.push(tiered("fuel-miser", "Fuel Miser", "droplet", [6.5, 7, 7.5], d.avgMpg, (n) => `${n.toFixed(1)} mpg`));
  if (d.loanPaidPct != null)
    medals.push(tiered("debt-crusher", "Debt Crusher", "lock-open", [0.25, 0.5, 0.75], d.loanPaidPct, (n) => `${Math.round(n * 100)}%`));
  return medals;
};

// This truck's records (improving bests) — for the Record Book.
export interface TruckRecords {
  bestTank: number | null;
  bigMonthMiles: number | null;
  bestRevPerMile: number | null;
  longestHaul: number | null;
}

export const truckRecords = (truckLoads: Load[], truckFuel: FuelEntry[]): TruckRecords => {
  const dl = delivered(truckLoads);
  const windows = mpgWindows(truckFuel);
  const monthMiles = byMonth(dl, (ls) => ls.reduce((s, l) => s + loadMiles(l), 0));
  const monthRpm = byMonth(dl, (ls) => {
    const net = ls.reduce((s, l) => s + loadRevenue(l), 0);
    const mi = ls.reduce((s, l) => s + loadMiles(l), 0);
    return mi > 0 ? net / mi : 0;
  });
  const max = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null);
  return {
    bestTank: max(windows.map((w) => w.mpg).filter((m) => m > 0)),
    bigMonthMiles: max(monthMiles),
    bestRevPerMile: max(monthRpm),
    longestHaul: max(dl.map((l) => Number(l.loaded_miles) || 0)),
  };
};

// Static catalog for the Guide's award-system reference.
export const TRUCK_PATCH_GUIDE: { name: string; icon: string; how: string }[] = [
  { name: "Feather Foot", icon: "feather", how: "A tank clearing your top MPG bar — light-footed and climbing." },
  { name: "Iron Horse", icon: "road", how: "A workhorse month — one of your highest for miles driven." },
  { name: "Marathon", icon: "flag", how: "One of your longest single hauls." },
  { name: "Thrifty", icon: "coins", how: "A tank under your best fuel cost per mile." },
];

export const TRUCK_MEDAL_GUIDE: { name: string; icon: string; tiers: string }[] = [
  { name: "Mile Club", icon: "medal", tiers: "100k · 250k · 500k · 1M odometer mi" },
  { name: "Fuel Miser", icon: "droplet", tiers: "6.5 · 7.0 · 7.5 avg mpg" },
  { name: "Workhorse", icon: "stack-2", tiers: "100 · 250 · 500 loads hauled" },
  { name: "Debt Crusher", icon: "lock-open", tiers: "25% · 50% · 75% paid off" },
];
