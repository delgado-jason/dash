// Trailer-flavored awards — its own catalog, distinct from the truck's. A trailer
// has no engine, so it earns on the loads it carried: its 8% slice of net, the
// weight it hauled, hub miles, and monthly grind. Same engines: adaptive ratcheting
// bars for the patches, fixed tiers for the medals.
import type { Load } from "@/types/load";
import { loadTrailerNet } from "@/lib/metrics/rateTargets";
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

export const computeTrailerPatches = (trailerLoads: Load[]): Patch[] => {
  const dl = delivered(trailerLoads);
  const out: Patch[] = [];

  // Big Hauler — a load near the heaviest you carry.
  const weights = dl.map((l) => Number(l.weight) || 0).filter((w) => w > 0);
  const bh = computeStack(weights, { n: 5, floor: 46_000 });
  out.push({ key: "big-hauler", name: "Big Hauler", icon: "weight", count: bh.count, bar: bh.bar, unit: null, hint: `${num(bh.bar)}+ lb load` });

  // Marathon — one of your longest single hauls.
  const hauls = dl.map((l) => Number(l.loaded_miles) || 0).filter((m) => m > 0);
  const mar = computeStack(hauls, { n: 5, floor: 1200 });
  out.push({ key: "marathon", name: "Marathon", icon: "flag", count: mar.count, bar: mar.bar, unit: "miles", hint: `${num(mar.bar)}+ mi haul` });

  // Payday — a strong month for the trailer's cut.
  const monthEarn = byMonth(dl, (ls) => ls.reduce((s, l) => s + loadTrailerNet(l), 0));
  const pd = computeStack(monthEarn, { n: 5, floor: 1500 });
  out.push({ key: "payday", name: "Payday", icon: "cash", count: pd.count, bar: pd.bar, unit: "money", hint: `$${num(pd.bar)}+ earnings month` });

  // Road Grind — a workhorse month of miles.
  const monthMiles = byMonth(dl, (ls) => ls.reduce((s, l) => s + loadMiles(l), 0));
  const rg = computeStack(monthMiles, { n: 5, floor: 9000 });
  out.push({ key: "road-grind", name: "Road Grind", icon: "road", count: rg.count, bar: rg.bar, unit: "miles", hint: `${num(rg.bar)}+ mi month` });

  return out;
};

export interface TrailerMedalData {
  hubMiles: number;
  earnings: number; // cumulative 8% share
  deliveredCount: number;
  loanPaidPct: number | null; // trailer payoff
}

export const computeTrailerMedals = (d: TrailerMedalData): Medal[] => {
  const medals: Medal[] = [
    tiered("hub-club", "Hub Club", "medal", [25_000, 50_000, 100_000, 250_000], d.hubMiles, (n) => `${Math.round(n / 1000)}k`),
    tiered("trailer-earner", "Trailer Earner", "coins", [10_000, 25_000, 50_000], d.earnings, (n) => `$${Math.round(n / 1000)}k`),
    tiered("workhorse", "Workhorse", "stack-2", [100, 250, 500], d.deliveredCount, (n) => `${Math.round(n)}`),
  ];
  if (d.loanPaidPct != null)
    medals.push(tiered("debt-crusher", "Debt Crusher", "lock-open", [0.25, 0.5, 0.75], d.loanPaidPct, (n) => `${Math.round(n * 100)}%`));
  return medals;
};

// This trailer's records (improving bests) — for the Record Book.
export interface TrailerRecords {
  bestPayday: number | null; // best month for the trailer's cut
  longestHaul: number | null;
  heaviestLoad: number | null;
  bigMonthMiles: number | null;
}

export const trailerRecords = (trailerLoads: Load[]): TrailerRecords => {
  const dl = delivered(trailerLoads);
  const monthEarn = byMonth(dl, (ls) => ls.reduce((s, l) => s + loadTrailerNet(l), 0));
  const monthMiles = byMonth(dl, (ls) => ls.reduce((s, l) => s + loadMiles(l), 0));
  const max = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null);
  return {
    bestPayday: max(monthEarn),
    longestHaul: max(dl.map((l) => Number(l.loaded_miles) || 0)),
    heaviestLoad: max(dl.map((l) => Number(l.weight) || 0)),
    bigMonthMiles: max(monthMiles),
  };
};

// Static catalog for the Guide's award-system reference.
export const TRAILER_PATCH_GUIDE: { name: string; icon: string; how: string }[] = [
  { name: "Big Hauler", icon: "weight", how: "A load near the heaviest you carry — the bar climbs as you haul heavier." },
  { name: "Marathon", icon: "flag", how: "One of your longest single hauls." },
  { name: "Payday", icon: "cash", how: "A strong month for the trailer's own cut of the freight." },
  { name: "Road Grind", icon: "road", how: "A workhorse month — one of your highest for miles." },
];

export const TRAILER_MEDAL_GUIDE: { name: string; icon: string; tiers: string }[] = [
  { name: "Hub Club", icon: "medal", tiers: "25k · 50k · 100k · 250k hub mi" },
  { name: "Trailer Earner", icon: "coins", tiers: "$10k · $25k · $50k of its own cut" },
  { name: "Workhorse", icon: "stack-2", tiers: "100 · 250 · 500 loads carried" },
  { name: "Debt Crusher", icon: "lock-open", tiers: "25% · 50% · 75% paid off" },
];
