// Patches: hard, stackable feats. The "impressive" ones use an adaptive ratcheting
// bar set from the driver's own history (computeStack); the "structural" ones have a
// fixed definition (a new state, a cross-country run, two deliveries in a day). Every
// patch is derived from load data and takes the loads pre-filtered, so the same
// function scopes to a driver, a truck, or a trailer just by what you pass in.
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { loadGross, loadRevenue } from "@/lib/metrics/rateTargets";
import { computeStack, type BarOpts } from "./adaptiveBar";

export interface Patch {
  key: string;
  name: string;
  icon: string;
  count: number; // ×N earned (0 = not yet)
  bar: number | null; // current threshold to clear now (null = structural)
  unit: "money" | "miles" | "pct" | "weight" | null;
  hint: string; // one-liner requirement / progress
}

const delivered = (loads: Load[]): Load[] =>
  loads
    .filter((l) => l.load_status === "delivered" && l.delivery_date)
    .sort((a, b) => (a.delivery_date! < b.delivery_date! ? -1 : 1));

const weekKey = (iso: string): string => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
};
const monthKey = (iso: string): string => iso.slice(0, 7);

// Chronological buckets → a value per bucket, in time order.
const bucketed = <T>(
  loads: Load[],
  keyOf: (l: Load) => string,
  reduce: (ls: Load[]) => T,
): T[] => {
  const map = new Map<string, Load[]>();
  for (const l of loads) {
    const k = keyOf(l);
    (map.get(k) ?? map.set(k, []).get(k)!).push(l);
  }
  return [...map.keys()].sort().map((k) => reduce(map.get(k)!));
};

const WEST = new Set(["WA", "OR", "CA", "NV", "ID", "UT", "AZ", "MT", "WY", "CO", "NM", "AK", "HI"]);
const EAST = new Set(["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "VA", "WV", "NC", "SC", "GA", "FL"]);
const spansCoasts = (a: string | null, b: string | null): boolean =>
  !!a && !!b && ((WEST.has(a) && EAST.has(b)) || (EAST.has(a) && WEST.has(b)));

const ADAPTIVE: {
  key: string;
  name: string;
  icon: string;
  unit: Patch["unit"];
  opts: BarOpts;
  value: (l: Load) => number;
  bucket?: "week" | "month"; // adaptive over per-week/per-month values, else per-load
  weekMetric?: (ls: Load[]) => number; // for bucketed metrics
}[] = [
  { key: "big-ticket", name: "Big Ticket", icon: "cash", unit: "money", opts: { n: 5, floor: 7000 }, value: (l) => loadGross(l) },
  { key: "long-hauler", name: "Long Hauler", icon: "road", unit: "miles", opts: { n: 5, floor: 1200 }, value: (l) => Number(l.loaded_miles) || 0 },
  { key: "mountain-mover", name: "Mountain Mover", icon: "mountain", unit: "weight", opts: { n: 5, floor: 46000 }, value: (l) => Number(l.weight) || 0 },
];

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const computePatches = (loads: Load[], _fuel: FuelEntry[]): Patch[] => {
  const dl = delivered(loads);
  const out: Patch[] = [];

  // ---- per-load adaptive feats ----
  for (const d of ADAPTIVE) {
    const chrono = dl.map(d.value).filter((v) => v > 0);
    const s = computeStack(chrono, d.opts);
    const barText =
      d.unit === "money" ? money(s.bar) : d.unit === "miles" ? `${Math.round(s.bar).toLocaleString("en-US")} mi` : `${Math.round(s.bar).toLocaleString("en-US")} lb`;
    out.push({ key: d.key, name: d.name, icon: d.icon, count: s.count, bar: s.bar, unit: d.unit, hint: `clear ${barText}` });
  }

  // ---- Rainmaker: adaptive over per-month net ----
  const monthlyNet = bucketed(dl, (l) => monthKey(l.delivery_date!), (ls) => ls.reduce((s, l) => s + loadRevenue(l), 0));
  const rain = computeStack(monthlyNet, { n: 5, floor: 12000 });
  out.push({ key: "rainmaker", name: "Rainmaker", icon: "coins", count: rain.count, bar: rain.bar, unit: "money", hint: `${money(rain.bar)} net in a month` });

  // ---- Iron Week: adaptive over loads-per-week ----
  const weeklyLoads = bucketed(dl, (l) => weekKey(l.delivery_date!), (ls) => ls.length);
  const iron = computeStack(weeklyLoads, { n: 5, floor: 5 });
  out.push({ key: "iron-week", name: "Iron Week", icon: "barbell", count: iron.count, bar: iron.bar, unit: null, hint: `${Math.round(iron.bar)}+ loads in a week` });

  // ---- Clean Run: adaptive over weekly deadhead %, lower is better ----
  const weeklyDeadhead = bucketed(
    dl,
    (l) => weekKey(l.delivery_date!),
    (ls) => {
      const loaded = ls.reduce((s, l) => s + (Number(l.loaded_miles) || 0), 0);
      const dead = ls.reduce((s, l) => s + (Number(l.deadhead_miles) || 0), 0);
      return loaded + dead > 0 ? dead / (loaded + dead) : 1;
    },
  );
  const clean = computeStack(weeklyDeadhead, { n: 5, floor: 0.1, lowerIsBetter: true });
  out.push({ key: "clean-run", name: "Clean Run", icon: "gauge", count: clean.count, bar: clean.bar, unit: "pct", hint: `a week under ${(clean.bar * 100).toFixed(0)}% deadhead` });

  // ---- Trailblazer (structural): distinct states touched — the count IS the map ----
  const states = new Set<string>();
  for (const l of dl) {
    if (l.origin_state) states.add(l.origin_state);
    if (l.destination_state) states.add(l.destination_state);
  }
  out.push({ key: "trailblazer", name: "Trailblazer", icon: "map-pin", count: states.size, bar: null, unit: null, hint: `${states.size} / 48 states` });

  // ---- Coast to Coast (structural): a single run spanning West ↔ East ----
  const coast = dl.filter((l) => spansCoasts(l.origin_state, l.destination_state)).length;
  out.push({ key: "coast-to-coast", name: "Coast to Coast", icon: "arrows-horizontal", count: coast, bar: null, unit: null, hint: "a cross-country run" });

  // ---- Doubleheader (structural): days with 2+ deliveries ----
  const perDay = new Map<string, number>();
  for (const l of dl) perDay.set(l.delivery_date!.slice(0, 10), (perDay.get(l.delivery_date!.slice(0, 10)) ?? 0) + 1);
  const doubles = [...perDay.values()].filter((c) => c >= 2).length;
  out.push({ key: "doubleheader", name: "Doubleheader", icon: "layers-subtract", count: doubles, bar: null, unit: null, hint: "2+ delivered in a day" });

  return out;
};
