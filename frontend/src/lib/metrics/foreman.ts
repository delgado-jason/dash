// The Foreman — "who to call from where you'll be empty next." Ranks the agents
// you've booked by three axes, all on the SAME basis the Agents page uses:
//   • Proximity  — straight-line miles from your empty-next point to the agent's
//                  NEAREST recurring origin (not their average — the question is
//                  "can they load me near here").
//   • Rate       — the agent's gross $/LOADED mile FOR A LOAD TYPE, measured
//                  against your own target/average for that type (loaded basis,
//                  so an agent is never dinged for a deadhead they didn't cause).
//   • History    — loads together, recency, and dwell (money left sitting).
//
// It is a call list from who you've booked, ranked by history + fit — NOT a live
// load feed. Everything is GROSS (agents are a market-value lens), matching
// agentScorecard. Distances come from the persisted city_coords cache; a city we
// can't trust a coordinate for falls back to region-level, never a fake number.
import type { Load } from "@/types/load";
import type { Agent } from "@/types/agent";
import { loadRevenue } from "./loads"; // GROSS per load
import { median } from "./stats";
import {
  buildAgentScorecards,
  MIN_SCORE_LOADS,
  type AgentScorecard,
  type GoToTier,
} from "./agentScorecard";
import { getRegion, getMacro } from "@/lib/constants/states";

// ---- load types ----
export const LOAD_TYPES = [
  "standard flatbed",
  "oversize",
  "hazmat",
  "heavy haul",
] as const;
export type LoadType = (typeof LOAD_TYPES)[number];
export type LoadTypeFocus = "any" | LoadType;
const STANDARD_TYPE: LoadType = "standard flatbed";
// Specialized = anything non-standard → the Specialized tier set (oversize /
// hazmat / heavy haul), matching lib/constants/targets.
export const isSpecialized = (type: string): boolean => type !== STANDARD_TYPE;

export type ForemanMode = "balanced" | "closest" | "best-rate";

// ---- geo ----
export interface CityCoord {
  lat: number;
  lng: number;
}
export type CoordMap = Map<string, CityCoord>; // key = cityKey(city, state)

export const cityKey = (city?: string | null, state?: string | null): string =>
  `${String(city ?? "").trim().toUpperCase()},${String(state ?? "").trim().toUpperCase()}`;

const R_MILES = 3958.7613;
const toRad = (d: number) => (d * Math.PI) / 180;

// Great-circle (straight-line) distance in miles between two coordinates. Plenty
// precise for RANKING agents by proximity — we're ordering, not billing miles.
export const haversineMiles = (a: CityCoord, b: CityCoord): number => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
};

// ---- anchor: where you'll be empty next ----
export interface Anchor {
  city: string;
  state: string;
  source: "committed" | "last-delivered";
}

const COMMITTED = new Set(["booked", "in_transit"]);
const refDay = (l: Load): string => l.delivery_date ?? l.pickup_date ?? "";

// Your empty-next point = the destination of the furthest-out load you're already
// committed to (booked or in-transit) — you're covered until it drops. With
// nothing committed, you're already empty at your last delivery. null when there's
// no usable load at all.
export const emptyNextAnchor = (loads: Load[]): Anchor | null => {
  const committed = loads.filter(
    (l) => COMMITTED.has(l.load_status) && l.destination_city && l.destination_state,
  );
  if (committed.length) {
    const f = committed.reduce((best, l) => (refDay(l) > refDay(best) ? l : best));
    return { city: f.destination_city, state: f.destination_state, source: "committed" };
  }
  const delivered = loads.filter(
    (l) =>
      l.load_status === "delivered" &&
      l.destination_city &&
      l.destination_state &&
      l.delivery_date,
  );
  if (delivered.length) {
    const latest = delivered.reduce((best, l) =>
      (l.delivery_date as string) > (best.delivery_date as string) ? l : best,
    );
    return {
      city: latest.destination_city,
      state: latest.destination_state,
      source: "last-delivered",
    };
  }
  return null;
};

// ---- per-agent helpers ----
type Place = { city: string; state: string };

// Every origin an agent has loaded you from (non-cancelled), so we can find the
// one closest to where you'll be empty.
const agentOrigins = (loads: Load[]): Map<string, Place[]> => {
  const m = new Map<string, Place[]>();
  for (const l of loads) {
    if (l.load_status === "cancelled" || !l.agent_id || !l.origin_city || !l.origin_state)
      continue;
    const arr = m.get(l.agent_id) ?? [];
    arr.push({ city: l.origin_city, state: l.origin_state });
    m.set(l.agent_id, arr);
  }
  return m;
};

const loadRpm = (l: Load): number | null => {
  const miles = Number(l.loaded_miles);
  if (!(miles > 0)) return null;
  return loadRevenue(l) / miles; // GROSS ÷ loaded mile
};

// An agent's typical gross $/loaded mile for ONE load type (delivered loads only).
const agentTypeRpm = (loads: Load[], type: LoadType): number | null => {
  const rpms = loads
    .filter((l) => l.load_status === "delivered" && l.load_type === type)
    .map(loadRpm)
    .filter((r): r is number => r != null);
  return rpms.length ? median(rpms) : null;
};

const agentTypeCount = (loads: Load[], type: LoadType): number =>
  loads.filter((l) => l.load_status === "delivered" && l.load_type === type).length;

// The type an agent brings you most (for focus = "any").
const dominantType = (loads: Load[]): LoadType => {
  let best: LoadType = STANDARD_TYPE;
  let bestN = -1;
  for (const t of LOAD_TYPES) {
    const n = agentTypeCount(loads, t);
    if (n > bestN) {
      bestN = n;
      best = t;
    }
  }
  return best;
};

// ---- rate benchmark ----
// Your per-type rate yardstick = your OWN realized median gross $/loaded mile for
// that load type. So an agent reads against what you actually get for oversize vs
// flatbed vs hazmat — the honest "my average rate per mile with the load type."
// The real data shows this swings hard by type (flatbed ~$5, oversize ~$8.7), so
// a per-type yardstick is the whole point; a single blended average would make
// every flatbed agent look terrible next to your oversize rates. (A tier-markup
// TARGET was considered, but it hangs off a type-agnostic break-even and would
// saturate for specialized freight — every oversize agent reads far "over target"
// — so it can't tell strong oversize agents from weak ones. The median can.)
const typeBenchmark = (type: LoadType, allLoads: Load[]): number | null => {
  const mine = allLoads
    .filter((l) => l.load_status === "delivered" && l.load_type === type)
    .map(loadRpm)
    .filter((r): r is number => r != null);
  return mine.length ? median(mine) : null;
};

// ---- scoring ----
// Balanced weights RELATIONSHIP as heavily as proximity (Jason's steer: he's
// building ties, not shopping the board), with rate a notch below. Exported so
// the Guide can state them and tests can pin them.
export const FOREMAN_WEIGHTS = { proximity: 0.35, rate: 0.3, relationship: 0.35 };
const FADE_MILES = 500; // proximity score reaches 0 by here
const REL_FULL_LOADS = 5; // loads together for a full relationship base
const RECENCY_DAYS = 90; // recency fades to 0 by here

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ---- output ----
export interface AgentRanking {
  agentId: string;
  agentName: string;
  // proximity
  nearestOrigin: Place | null;
  distanceMiles: number | null; // straight-line; null when no trusted coord
  regionFallback: boolean; // true → ranked by region, not miles
  // rate (for the judged type)
  loadType: LoadType; // the type this agent is judged on
  rpm: number | null; // gross ÷ loaded mile for that type
  benchmark: number | null; // your realized median gross/loaded for this type
  rateDelta: number | null; // rpm − benchmark
  typeLoadCount: number; // delivered loads of the judged type
  // history
  loadCount: number; // total delivered with this agent
  daysSince: number | null;
  dwellLoads: number; // confirmed-billable detention left unpaid
  tier: GoToTier;
  isNew: boolean; // < MIN_SCORE_LOADS delivered → "New · building"
  // scoring
  score: number;
  why: string;
}

export interface ForemanBoard {
  anchor: Anchor | null;
  anchorResolved: boolean; // did the anchor city have a trusted coordinate?
  focus: LoadTypeFocus;
  mode: ForemanMode;
  benchmark: number | null; // the focus type's median (when focus ≠ any)
  rankings: AgentRanking[]; // best first
  coverage: { withCoords: number; total: number }; // how many agents got real miles
}

// Region proximity as a fallback ordering when a coordinate is missing: same
// freight region as the anchor is closest, then same macro, then elsewhere.
const regionRank = (anchorState: string, originState: string): number => {
  if (getRegion(anchorState) === getRegion(originState)) return 0;
  if (getMacro(anchorState) === getMacro(originState)) return 1;
  return 2;
};

// Real-miles agents sit in the [0.3, 1.0] band; region-fallback agents (no
// trusted coordinate) sit strictly BELOW it — so a KNOWN distance always beats an
// unknown one, even a far known origin over a same-region guess. Within each band,
// closer ranks higher.
const proximityScore = (r: AgentRanking, anchorState: string): number => {
  if (r.distanceMiles != null) return 0.3 + 0.7 * clamp01(1 - r.distanceMiles / FADE_MILES);
  if (!r.nearestOrigin) return 0;
  const rank = regionRank(anchorState, r.nearestOrigin.state);
  return rank === 0 ? 0.2 : rank === 1 ? 0.12 : 0.05;
};

const rateScore = (r: AgentRanking): number => {
  if (r.rpm == null) return 0.35; // unknown rate → mild neutral
  if (r.benchmark == null || r.benchmark <= 0) return 0.5;
  return clamp01(0.5 + (r.rpm - r.benchmark) / r.benchmark); // at benchmark = 0.5
};

const relationshipScore = (r: AgentRanking): number => {
  const depth = clamp01(r.loadCount / REL_FULL_LOADS);
  const recency =
    r.daysSince == null ? 0.3 : clamp01(1 - r.daysSince / RECENCY_DAYS);
  const dwellPenalty = r.dwellLoads > 0 ? 0.15 : 0;
  return clamp01(depth * 0.6 + recency * 0.4 - dwellPenalty);
};

// Short, human labels for a load type (the stencil-free operational voice).
export const TYPE_LABELS: Record<LoadType, string> = {
  "standard flatbed": "Flatbed",
  oversize: "Oversize",
  hazmat: "Hazmat",
  "heavy haul": "Heavy haul",
};

export const distanceLabel = (r: AgentRanking): string => {
  if (r.distanceMiles != null) return `~${Math.round(r.distanceMiles)} mi`;
  if (r.nearestOrigin) return `${getRegion(r.nearestOrigin.state)} region`;
  return "—";
};

const whyLine = (r: AgentRanking, anchor: Anchor): string => {
  const bits: string[] = [];
  const where = r.nearestOrigin ? `${r.nearestOrigin.city}, ${r.nearestOrigin.state}` : "";
  if (r.isNew) {
    bits.push(`New tie — ${r.loadCount} load${r.loadCount === 1 ? "" : "s"} so far`);
    if (r.distanceMiles != null) bits.push(`${distanceLabel(r)} from your drop`);
    else if (where) bits.push(`sources out of ${where}`);
    bits.push("a relationship worth building");
    return capitalize(bits.join(", ")) + ".";
  }
  bits.push(`Your ${r.loadCount >= REL_FULL_LOADS ? "deepest" : "strongest"} tie near ${anchor.city}`);
  bits.push(`${r.loadCount} loads`);
  if (r.distanceMiles != null) bits.push(`${distanceLabel(r)} from your drop`);
  if (r.rateDelta != null)
    bits.push(
      r.rateDelta >= 0
        ? "pays at or above your usual for the type"
        : "pays a touch under your usual for the type",
    );
  return bits.join(", ") + ".";
};

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Build the ranked call list. `loads` and `agents` are your full sets; `coords`
// is the trusted city_coords lookup.
export const buildForemanBoard = (
  loads: Load[],
  agents: Agent[],
  coords: CoordMap,
  opts: {
    focus?: LoadTypeFocus;
    mode?: ForemanMode;
    now?: Date;
  } = {},
): ForemanBoard => {
  const focus = opts.focus ?? "any";
  const mode = opts.mode ?? "balanced";
  const now = opts.now ?? new Date();

  const anchor = emptyNextAnchor(loads);
  const anchorCoord = anchor ? coords.get(cityKey(anchor.city, anchor.state)) ?? null : null;

  const scorecards = buildAgentScorecards(agents, loads, now);
  const origins = agentOrigins(loads);
  const nameById = new Map(agents.map((a) => [a.agent_id, agentName(a)]));

  // one benchmark cache per type (identical across agents)
  const benchCache = new Map<LoadType, number | null>();
  const benchFor = (t: LoadType): number | null => {
    if (benchCache.has(t)) return benchCache.get(t) ?? null;
    const b = typeBenchmark(t, loads);
    benchCache.set(t, b);
    return b;
  };

  let withCoords = 0;
  const rankings: AgentRanking[] = [];

  for (const [agentId, card] of scorecards) {
    // Non-cancelled loads only: a roster agent with no loads — or only cancelled
    // ones — is not on your call list (this is a call list from your history).
    const agentLoads = loads.filter(
      (l) => l.agent_id === agentId && l.load_status !== "cancelled",
    );
    if (agentLoads.length === 0) continue;

    // The type this agent is judged on, and whether they qualify under a focus.
    let judgedType: LoadType;
    if (focus === "any") {
      judgedType = dominantType(agentLoads);
    } else {
      if (agentTypeCount(agentLoads, focus) === 0) continue; // no such freight from them
      judgedType = focus;
    }

    // nearest origin with a trusted coordinate → straight-line miles
    const myOrigins = origins.get(agentId) ?? [];
    let nearestOrigin: Place | null = null;
    let distanceMiles: number | null = null;
    if (anchorCoord) {
      for (const o of myOrigins) {
        const c = coords.get(cityKey(o.city, o.state));
        if (!c) continue;
        const d = haversineMiles(anchorCoord, c);
        if (distanceMiles == null || d < distanceMiles) {
          distanceMiles = d;
          nearestOrigin = o;
        }
      }
    }
    const regionFallback = distanceMiles == null;
    // For the label/region fallback, still surface an origin even without coords:
    // the one in the closest region to the anchor.
    if (!nearestOrigin && myOrigins.length && anchor) {
      nearestOrigin = [...myOrigins].sort(
        (a, b) => regionRank(anchor.state, a.state) - regionRank(anchor.state, b.state),
      )[0];
    }
    if (distanceMiles != null) withCoords++;

    const bench = benchFor(judgedType);
    const rpm = agentTypeRpm(agentLoads, judgedType);

    const r: AgentRanking = {
      agentId,
      agentName: nameById.get(agentId) ?? "Agent",
      nearestOrigin,
      distanceMiles,
      regionFallback,
      loadType: judgedType,
      rpm,
      benchmark: bench,
      rateDelta: rpm != null && bench != null ? rpm - bench : null,
      typeLoadCount: agentTypeCount(agentLoads, judgedType),
      loadCount: card.loadCount,
      daysSince: card.daysSince,
      dwellLoads: card.moneyLostLoads,
      tier: card.tier,
      isNew: card.loadCount < MIN_SCORE_LOADS,
      score: 0,
      why: "",
    };
    rankings.push(r);
  }

  // score for the active mode
  const anchorState = anchor?.state ?? "";
  for (const r of rankings) {
    if (mode === "closest") {
      r.score = proximityScore(r, anchorState);
    } else if (mode === "best-rate") {
      // Raw highest-paying first (what "best rate" reads as); unknown rate last.
      r.score = r.rpm ?? -1;
    } else {
      r.score =
        FOREMAN_WEIGHTS.proximity * proximityScore(r, anchorState) +
        FOREMAN_WEIGHTS.rate * rateScore(r) +
        FOREMAN_WEIGHTS.relationship * relationshipScore(r);
    }
  }

  rankings.sort((a, b) => b.score - a.score || (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));
  if (anchor) for (const r of rankings) r.why = whyLine(r, anchor);

  return {
    anchor,
    anchorResolved: anchorCoord != null,
    focus,
    mode,
    benchmark: focus === "any" ? null : benchFor(focus),
    rankings,
    coverage: { withCoords, total: rankings.length },
  };
};

// Agent display name — first + last, as the roster shows it.
function agentName(a: Agent): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Agent";
}

// Re-export for consumers that want the shared scorecard shape alongside.
export type { AgentScorecard };
