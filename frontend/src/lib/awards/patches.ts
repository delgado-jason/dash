// Patches: hard, stackable feats. The "impressive" ones use an adaptive ratcheting
// bar set from the driver's own history (computeStack); the "structural" ones have a
// fixed definition (a new state, a cross-country run, two deliveries in a day). Every
// patch is derived from load data and takes the loads pre-filtered, so the same
// function scopes to a driver, a truck, or a trailer just by what you pass in.
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { loadGross, loadRevenue } from "@/lib/metrics/rateTargets";
import { formatInches } from "@/lib/dimensions";
import { computeStack, type BarOpts } from "./adaptiveBar";
import { money } from "@/lib/format";

export interface Patch {
  key: string;
  name: string;
  icon: string;
  count: number; // ×N earned (0 = not yet)
  bar: number | null; // current threshold to clear now (null = structural)
  unit: "money" | "miles" | "pct" | "weight" | "length" | null;
  operational?: boolean; // true = operation-specific set (shown blue), else universal
  hint: string; // one-liner requirement / progress
}

// Operations that run open-deck freight and so earn the oversize/flatbed set.
const OPEN_DECK = new Set(["flatbed", "heavy haul", "oversize"]);

// A genuine superload by the common cross-state thresholds (varies by state):
// beyond ~16' wide/high, ~150' long, or ~200,000 lb. See #231 research.
const SUPER_WIDTH_IN = 16 * 12;
const SUPER_HEIGHT_IN = 16 * 12;
const SUPER_LENGTH_IN = 150 * 12;
const SUPER_WEIGHT_LB = 200_000;
const isSuperload = (l: Load): boolean =>
  (Number(l.width_in) || 0) >= SUPER_WIDTH_IN ||
  (Number(l.height_in) || 0) >= SUPER_HEIGHT_IN ||
  (Number(l.length_in) || 0) >= SUPER_LENGTH_IN ||
  (Number(l.weight) || 0) >= SUPER_WEIGHT_LB;

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
];

export const computePatches = (
  loads: Load[],
  _fuel: FuelEntry[],
  operation: string = "flatbed",
): Patch[] => {
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

  // (Deadhead is a structural cost of oversize work, not a feat to chase, so
  // there's no weekly-deadhead patch — removed 2026-07-25 at Jason's call.)

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

  // ---- Operation-specific set (open-deck): the oversize/flatbed feats, shown blue.
  // Gated so a tanker or van never sees "Wide Load". Dimensions come from #244.
  if (OPEN_DECK.has(operation)) {
    // Wide Load — adaptive on cargo width, floor 12' (only true wide loads count).
    const widths = dl.map((l) => Number(l.width_in) || 0).filter((v) => v > 0);
    const wide = computeStack(widths, { n: 5, floor: 12 * 12 });
    out.push({ key: "wide-load", name: "Wide Load", icon: "move-horizontal", count: wide.count, bar: wide.bar, unit: "length", operational: true, hint: `clear ${formatInches(Math.round(wide.bar))}` });

    // Long Load — adaptive on cargo length, floor 80'.
    const lengths = dl.map((l) => Number(l.length_in) || 0).filter((v) => v > 0);
    const long = computeStack(lengths, { n: 5, floor: 80 * 12 });
    out.push({ key: "long-load", name: "Long Load", icon: "ruler", count: long.count, bar: long.bar, unit: "length", operational: true, hint: `clear ${formatInches(Math.round(long.bar))}` });

    // Mountain Mover — adaptive on weight (operation-specific for open-deck).
    const weights = dl.map((l) => Number(l.weight) || 0).filter((v) => v > 0);
    const mm = computeStack(weights, { n: 5, floor: 46000 });
    out.push({ key: "mountain-mover", name: "Mountain Mover", icon: "mountain", count: mm.count, bar: mm.bar, unit: "weight", operational: true, hint: `clear ${Math.round(mm.bar).toLocaleString("en-US")} lb` });

    // Super Load — structural: a genuine superload by the real thresholds. Sits at
    // x0 until you run one — a career milestone, not an everyday feat.
    const supers = dl.filter(isSuperload).length;
    out.push({ key: "super-load", name: "Super Load", icon: "crown", count: supers, bar: null, unit: null, operational: true, hint: "16'W · 16'H · 150'L · 200k lb" });
  }

  return out;
};

// Static catalog for the Guide's award-system reference (name + how to earn).
export const PATCH_GUIDE: { name: string; icon: string; how: string }[] = [
  { name: "Big Ticket", icon: "cash", how: "Land a top-tier load gross — the bar rises as you book bigger." },
  { name: "Long Hauler", icon: "road", how: "A haul among your longest — 1,000+ mi and climbing." },
  { name: "Wide Load", icon: "move-horizontal", how: "An over-12' load — climbs toward your widest. (Open-deck operations.)" },
  { name: "Long Load", icon: "ruler", how: "An 80'+ load by cargo length — the long stuff. (Open-deck operations.)" },
  { name: "Mountain Mover", icon: "mountain", how: "One of your heaviest loads. (Open-deck operations.)" },
  { name: "Super Load", icon: "crown", how: "A true superload — 16' wide/high, 150' long, or 200k lb. A career milestone." },
  { name: "Rainmaker", icon: "coins", how: "A top-tier net month." },
  { name: "Iron Week", icon: "barbell", how: "One of your busiest pay-weeks by load count." },
  { name: "Trailblazer", icon: "map-pin", how: "Deliver to a new state — the ×count is your states-conquered map." },
  { name: "Coast to Coast", icon: "arrows-horizontal", how: "A single run spanning the West and East coasts." },
  { name: "Doubleheader", icon: "layers-subtract", how: "Deliver two or more loads in one day." },
];
