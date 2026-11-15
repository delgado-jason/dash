// The Foreman — "who to call from where you'll be empty next." Ranks the agents
// you've booked by three axes:
//   • Proximity  — straight-line miles from your empty-next point to the agent's
//                  NEAREST point — a market a load proved or one they claimed
//                  on a call (not their average — the question is "can they
//                  load me near here").
//   • Rate       — the agent's gross $/DRIVEN mile for the freight they are
//                  judged on, against the rung for that freight's book, in the
//                  Load Scorer's words — the same number and word the agent's
//                  file prints (one basis, the retirement sheet's call 6).
//   • History    — loads together, recency, and dwell (money left sitting).
//
// And YOUR RATING on every row, acted on (call 2, Nov 15, 2026 — an agent is
// graded by the rating and nothing else): a desk rated 1 · Blacklist is never
// ranked and is listed under its own heading; a 2 · Avoid is ranked where the
// score puts it and dimmed; the rating breaks score ties. Parked is the
// owner's explicit call only — the 180-day "dormant" derivation that used to
// hide a quiet desk is gone; its quiet days are printed instead.
//
// It is a call list from who you've booked — and who told you where their
// freight is — NOT a live load feed. Everything is GROSS (agents are a
// market-value lens), matching agentScorecard. Distances come from the
// persisted city_coords cache; a city we can't trust a coordinate for falls
// back to region-level, never a fake number.
//
// An agent's footprint is TWO kinds of point (decision 6A): the loads they have
// actually given you — PROVED, and read through the load's customer-end mark
// (decision 5A), so the origin on a normal load and the destination when the
// agent's customer took delivery — plus the markets they CLAIMED on a call
// (agent_coverage, still 'stated'). A claim gets the same distance math as a
// proved point and is captioned "claimed". Coverage already confirmed by a
// load reads as proved.
import type { Load } from "@/types/load";
import type { Agent } from "@/types/agent";
import { footprintPoint } from "@/lib/loads/customerEnd";
import { loadRevenue } from "./loads"; // GROSS per load
import { perDayOver } from "./perDay";
import { median } from "./stats";
import { buildAgentScorecards, MIN_SCORE_LOADS, type AgentScorecard } from "./agentScorecard";
import { getRegion, getMacro } from "@/lib/constants/states";
import { codeOf, type CodeKind } from "@/lib/agencies/codeOf";
import { isDelivered } from "./status";
import type { RateLadder } from "./rateTargets";
import {
  drivenMiles,
  verdictFor,
  worthASecondCall,
  VERDICT_MIN_LOADS,
  type Book,
  type RateVerdict,
} from "./agentByType";
import { standingOf, type Standing } from "@/lib/agents/standing";
import { daysBetweenKeys, utcDayKey } from "@/lib/dates/dayKeys";
import { lastTouchByAgent, type TouchLike } from "./parkedNearby";

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
// agents.freight_types is free text[] on the wire; only the four load types count.
const isLoadType = (t: string): t is LoadType => (LOAD_TYPES as readonly string[]).includes(t);
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
  source: "committed" | "last-delivered" | "last-trip";
}

// The slice of a trip the anchor reads — structural, so callers and tests can
// hand over whatever carries a trip's end.
export interface TripEndLike {
  trip_date: string;
  status: string;
  end_city: string | null;
  end_state: string | null;
  odometer_end?: number | string | null;
}

const COMMITTED = new Set(["booked", "in_transit"]);
const refDay = (l: Load): string => l.delivery_date ?? l.pickup_date ?? "";
const day = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);
const odo = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A trip that has rolled (or is rolling): its end is where the truck sits — or
// will sit — after it. Planned and cancelled trips say nothing about the truck.
const ROLLED = new Set(["completed", "active"]);
export const latestTripEnd = <T extends TripEndLike>(trips: T[]): T | null => {
  let best: T | null = null;
  for (const t of trips) {
    if (!ROLLED.has(t.status) || !t.end_city || !t.end_state || !t.trip_date) continue;
    if (!best || day(t.trip_date) > day(best.trip_date)) best = t;
    else if (day(t.trip_date) === day(best.trip_date)) {
      const a = odo(t.odometer_end);
      const b = odo(best.odometer_end);
      if (a != null && b != null ? a > b : a != null) best = t;
    }
  }
  return best;
};

// The trip came AFTER the delivery when it's dated later — or dated the same
// day and its end reading is past the load's (a run home that starts at the
// drop, the same afternoon). Same day with no readings: the trip wins, since a
// trip logged on a delivery day starts where the drop ended.
const tripAfterDelivery = (t: TripEndLike, l: Load): boolean => {
  const td = day(t.trip_date);
  const ld = day(l.delivery_date);
  if (td !== ld) return td > ld;
  const a = odo(t.odometer_end);
  const b = odo(l.odometer_end);
  return a != null && b != null ? a > b : true;
};

// Your empty-next point = the destination of the furthest-out load you're already
// committed to (booked or in-transit) — you're covered until it drops. With
// nothing committed, you're already empty wherever the truck last stopped: the
// last delivery, or the end of a trip that rolled after it (home, the shop,
// repositioning — Jason, 2026-11-01: "it's not looking at trips for the last
// known location"). null when there's no usable load or trip at all.
export const emptyNextAnchor = (loads: Load[], trips: TripEndLike[] = []): Anchor | null => {
  const committed = loads.filter(
    (l) => COMMITTED.has(l.load_status) && l.destination_city && l.destination_state,
  );
  if (committed.length) {
    const f = committed.reduce((best, l) => (refDay(l) > refDay(best) ? l : best));
    return { city: f.destination_city, state: f.destination_state, source: "committed" };
  }
  const delivered = loads.filter(
    (l) =>
      isDelivered(l) &&
      l.destination_city &&
      l.destination_state &&
      l.delivery_date,
  );
  const latest = delivered.length
    ? delivered.reduce((best, l) => ((l.delivery_date as string) > (best.delivery_date as string) ? l : best))
    : null;
  const trip = latestTripEnd(trips);
  if (trip && (!latest || tripAfterDelivery(trip, latest))) {
    return { city: trip.end_city as string, state: trip.end_state as string, source: "last-trip" };
  }
  if (latest) {
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

// How much a footprint point is backed by. Both measure the same way; only the
// caption differs, and the Foreman says which one it used.
export type PointSource = "proved" | "claimed";
type FootPoint = Place & { source: PointSource };

// The stated-markets rows (agent_coverage) as the board needs them. `source`
// is 068's confidence flag: 'stated' until a load proves it 'confirmed'.
export interface CoveragePointLike {
  agent_id: string;
  city: string;
  state: string;
  source?: string | null;
}

// Every point an agent's freight sits on, so we can find the one closest to
// where you'll be empty: their loads' footprint points (non-cancelled), plus
// the markets they named. A 'neither' load contributes nothing.
const agentPoints = (loads: Load[], coverage: CoveragePointLike[]): Map<string, FootPoint[]> => {
  const m = new Map<string, FootPoint[]>();
  const push = (agentId: string | null | undefined, place: Place | null, source: PointSource) => {
    if (!agentId || !place) return;
    const arr = m.get(agentId) ?? [];
    arr.push({ ...place, source });
    m.set(agentId, arr);
  };
  for (const l of loads) {
    if (l.load_status === "cancelled") continue;
    push(l.agent_id, footprintPoint(l), "proved");
  }
  for (const c of coverage) {
    const city = String(c.city ?? "").trim();
    const state = String(c.state ?? "").trim();
    if (!city || !state) continue;
    push(c.agent_id, { city, state }, c.source === "confirmed" ? "proved" : "claimed");
  }
  return m;
};

// ONE BASIS. Gross ÷ driven miles — the odometer window where it is real,
// else loaded + deadhead — the rule the agents list, the file, the Scorer and
// the ladder all read. The Foreman used to read gross ÷ LOADED miles against
// your own median for the type, so the same desk got two numbers and two
// words one page apart.
const loadRpm = (l: Load): number | null => {
  const miles = drivenMiles(l);
  if (!(miles > 0)) return null;
  return loadRevenue(l) / miles;
};

// An agent's typical gross $/driven mile for ONE load type (delivered loads only).
const agentTypeRpm = (loads: Load[], type: LoadType): number | null => {
  const rpms = loads
    .filter((l) => isDelivered(l) && l.load_type === type)
    .map(loadRpm)
    .filter((r): r is number => r != null);
  return rpms.length ? median(rpms) : null;
};

const agentTypeCount = (loads: Load[], type: LoadType): number =>
  loads.filter((l) => isDelivered(l) && l.load_type === type).length;

// Delivered loads of ANY type — "have they hauled you anything yet".
const agentTypeCountAll = (loads: Load[]): number =>
  loads.filter((l) => isDelivered(l)).length;

// The agent's $/day over the same delivered loads of the judged type — miles
// or no miles — weighted Σgross ÷ Σdays. Not quite the same SET as
// `agentTypeRpm`: a load with no miles has no $/mi to take a median of and
// drops out of that figure, while it still owns days of the truck and still
// counts here. The $/mi is a median (one fluke can't crown an agent), the
// $/day is weighted (a five-day haul owns five days).
const agentTypePerDay = (loads: Load[], type: LoadType): number | null =>
  perDayOver(loads.filter((l) => l.load_type === type)).perDay;

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

// ---- the rung ----
// The two books' ladders, as the agents list and the file hold them. A type's
// book is standard or specialized (oversize · hazmat · heavy haul), and its
// rung is that book's minimum. Absent → no rung, no verdict, a neutral rate
// score: a Foreman with no P&L month does not pretend to grade.
export interface ForemanLadders {
  standard: RateLadder;
  specialized: RateLadder;
}
export const bookOfType = (type: LoadType): Book => (isSpecialized(type) ? "specialized" : "standard");
const ladderFor = (type: LoadType, ladders?: ForemanLadders): RateLadder | null =>
  ladders ? ladders[bookOfType(type)] : null;

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
  agencyCode: string | null; // the 3-letter code they wear (their posting code, else the agency's); display only — never scored
  // WHICH code that is, so the chip can be drawn the two ways the Agencies Nod
  // Sheet draws it: "posting" dashed (their own desk), "agency" lit (the shared
  // one). null exactly when agencyCode is null — no code on file, no chip.
  codeKind: CodeKind | null;
  // proximity
  nearestOrigin: Place | null;
  // What backs the point above — a load they ran ("proved") or a market they
  // named on a call ("claimed"). null only when there is no point at all.
  nearestSource: PointSource | null;
  distanceMiles: number | null; // straight-line; null when no trusted coord
  regionFallback: boolean; // true → ranked by region, not miles
  // rate (for the judged type)
  loadType: LoadType; // the type this agent is judged on
  book: Book; // the book that type belongs to — whose rung it is held to
  rpm: number | null; // gross ÷ DRIVEN mile for that type, the median
  // What their freight pays PER DAY of the truck — Σgross ÷ Σdays over the
  // same delivered loads `rpm` reads. null when none of them carry both
  // dates; never 0. Judged against the ladder's daily target by perDayTone.
  perDay: number | null;
  rung: number | null; // the book's minimum, from the live ladder
  rateDelta: number | null; // rpm − rung
  verdict: RateVerdict | null; // the Scorer's word, once VERDICT_MIN_LOADS of the type
  typeLoadCount: number; // delivered loads of the judged type
  // history
  loadCount: number; // total delivered with this agent
  daysSince: number | null; // days since the last delivered load
  dwellLoads: number; // confirmed-billable detention left unpaid
  isNew: boolean; // < MIN_SCORE_LOADS delivered → "New · building"
  // your call
  rating: number | null;
  standing: Standing | null;
  avoid: boolean; // rated 2 — ranked, dimmed
  // the contact log
  lastSpokenTo: string | null; // the newest touch of any kind, 'YYYY-MM-DD'
  daysSinceSpoken: number | null | undefined; // undefined = the log did not come through
  secondCall: boolean; // one load, and it cleared its own book's rung
  // scoring
  score: number;
  why: string;
}

export interface ForemanBoard {
  anchor: Anchor | null;
  anchorResolved: boolean; // did the anchor city have a trusted coordinate?
  focus: LoadTypeFocus;
  mode: ForemanMode;
  rung: number | null; // the focus book's minimum (when focus ≠ any)
  rankings: AgentRanking[]; // best first
  // Rated 1 · Blacklist — your call, never ranked. Nearest first, so the
  // heading can still say who is near the drop.
  blacklisted: AgentRanking[];
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

// At the rung = 0.5; a rate a rung's worth above it = 1; unknown rate → mild
// neutral; no rung (no ladder yet) → neutral, never a grade.
const rateScore = (r: AgentRanking): number => {
  if (r.rpm == null) return 0.35;
  if (r.rung == null || r.rung <= 0) return 0.5;
  return clamp01(0.5 + (r.rpm - r.rung) / r.rung);
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

// The miles, and what backs them. A claimed market measures exactly like a
// proved one (6A) — so the sentence has to say which it is, or "~47 mi from
// your drop" reads as a load they actually ran out of there.
const dropBit = (r: AgentRanking): string =>
  `${distanceLabel(r)} from your drop${
    r.nearestSource !== "claimed"
      ? ""
      : r.loadCount === 0
        ? " — a market they claimed" // "nothing hauled yet" was just said
        : " — a market they claimed, no load yet"
  }`;

// "last spoken to 45 days ago" · "spoken to today" · "never called" — or
// nothing, when the contact log did not come through.
export const spokenBit = (r: Pick<AgentRanking, "daysSinceSpoken">): string | null => {
  if (r.daysSinceSpoken === undefined) return null;
  if (r.daysSinceSpoken == null) return "never called";
  if (r.daysSinceSpoken === 0) return "spoken to today";
  return `last spoken to ${r.daysSinceSpoken} day${r.daysSinceSpoken === 1 ? "" : "s"} ago`;
};

const whyLine = (r: AgentRanking, anchor: Anchor): string => {
  const bits: string[] = [];
  const where = r.nearestOrigin ? `${r.nearestOrigin.city}, ${r.nearestOrigin.state}` : "";
  const spoken = spokenBit(r);
  if (r.isNew) {
    bits.push(
      r.loadCount === 0
        ? "New tie — nothing hauled yet"
        : `New tie — ${r.loadCount} load${r.loadCount === 1 ? "" : "s"} so far`,
    );
    if (r.distanceMiles != null) bits.push(dropBit(r));
    else if (where) bits.push(`sources out of ${where}`);
    if (r.secondCall) bits.push("paid above the rung the once");
    if (spoken) bits.push(spoken);
    bits.push("a relationship worth building");
    return capitalize(bits.join(", ")) + ".";
  }
  bits.push(`Your ${r.loadCount >= REL_FULL_LOADS ? "deepest" : "strongest"} tie near ${anchor.city}`);
  bits.push(`${r.loadCount} loads`);
  if (r.distanceMiles != null) bits.push(dropBit(r));
  if (r.rateDelta != null)
    bits.push(
      r.rateDelta >= 0
        ? `pays above your ${TYPE_LABELS[r.loadType].toLowerCase()} rung`
        : `pays under your ${TYPE_LABELS[r.loadType].toLowerCase()} rung`,
    );
  if (spoken) bits.push(spoken);
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
    // The contact log, for "last spoken to" on every row. Hand it over only
    // once it has LANDED: an in-flight or failed fetch passed as [] would read
    // as "never called" on every row. Absent → the days read undefined and
    // the row says nothing.
    contacts?: TouchLike[];
    // The markets agents named on calls (agent_coverage). Decision 6A: a
    // stated market is a footprint point measured exactly like a proved one
    // and captioned "claimed"; one a load already confirmed reads as proved.
    // Absent → loads only, as before.
    coverage?: CoveragePointLike[];
    // The trips (home, shop, repositioning): a trip that rolled after the
    // last delivery is where the truck sits. Absent → loads alone.
    trips?: TripEndLike[];
    // The two books' ladders — the rungs the rate is held to and the words it
    // gets. Absent → no rung, no verdict, a neutral rate score.
    ladders?: ForemanLadders;
  } = {},
): ForemanBoard => {
  const focus = opts.focus ?? "any";
  const mode = opts.mode ?? "balanced";
  const now = opts.now ?? new Date();
  const nowKey = utcDayKey(now);
  // Parked = the owner's explicit call. A quiet desk stays on the list with
  // its quiet days printed.
  const isParked = (a: Agent): boolean => a.work_status === "parked";

  const anchor = emptyNextAnchor(loads, opts.trips ?? []);
  const anchorCoord = anchor ? coords.get(cityKey(anchor.city, anchor.state)) ?? null : null;

  const scorecards = buildAgentScorecards(agents, loads, now);
  const points = agentPoints(loads, opts.coverage ?? []);
  const nameById = new Map(agents.map((a) => [a.agent_id, agentName(a)]));
  const agentById = new Map(agents.map((a) => [a.agent_id, a]));
  const lastTouch = opts.contacts ? lastTouchByAgent(opts.contacts) : null;

  // "Second call": the list's rule, reused — one delivered load that cleared
  // its own book's rung. Needs the ladders; without them nobody is marked.
  const loadsByAgent = new Map<string, Load[]>();
  for (const l of loads) {
    if (!l.agent_id) continue;
    (loadsByAgent.get(l.agent_id) ?? loadsByAgent.set(l.agent_id, []).get(l.agent_id)!).push(l);
  }
  const secondCall = new Set(
    opts.ladders ? worthASecondCall(loadsByAgent, opts.ladders).map((s) => s.agentId) : [],
  );

  let withCoords = 0;
  const rankings: AgentRanking[] = [];
  const blacklisted: AgentRanking[] = [];

  for (const [agentId, card] of scorecards) {
    const agent = agentById.get(agentId);
    if (!agent || isParked(agent)) continue;
    // Who is on the call list: anyone with a footprint to measure. That is an
    // agent you've booked (non-cancelled loads), OR one with no load yet who
    // named a market on a call — decision 6A made a claim a real point, and a
    // point is what this board ranks, so a claim-only agent from Brandie's
    // qualification sweep reaches the board before the first load. A roster
    // agent with neither — or only cancelled loads and no claim — has nothing
    // to measure and stays off. (Until 2026-09-15 the gate was "at least one
    // load", which silently hid every claim-only agent.)
    const agentLoads = loads.filter(
      (l) => l.agent_id === agentId && l.load_status !== "cancelled",
    );
    const myPoints = points.get(agentId) ?? [];
    if (agentLoads.length === 0 && myPoints.length === 0) continue;

    // The type this agent is judged on, and whether they qualify under a focus.
    // With nothing delivered yet, the only word on their freight is what they
    // claimed on the qualification call (agents.freight_types): the first
    // claimed type is the judged one, and a focus is met by claiming it. Once
    // they've hauled something, hauled freight is the evidence, as before.
    const delivered = agentTypeCountAll(agentLoads);
    const claimedTypes = (agent.freight_types ?? []).filter(isLoadType);
    let judgedType: LoadType;
    if (focus === "any") {
      judgedType =
        delivered === 0 && claimedTypes.length ? claimedTypes[0] : dominantType(agentLoads);
    } else {
      const hauledIt = agentTypeCount(agentLoads, focus) > 0;
      const claimsIt = delivered === 0 && claimedTypes.includes(focus);
      if (!hauledIt && !claimsIt) continue; // no such freight from them, hauled or claimed
      judgedType = focus;
    }

    // nearest footprint point with a trusted coordinate → straight-line miles.
    // Proved and claimed points measure identically (6A) and compete on
    // distance alone; the winner's kind rides along as the caption.
    let nearest: FootPoint | null = null;
    let distanceMiles: number | null = null;
    if (anchorCoord) {
      for (const p of myPoints) {
        const c = coords.get(cityKey(p.city, p.state));
        if (!c) continue;
        const d = haversineMiles(anchorCoord, c);
        if (distanceMiles == null || d < distanceMiles) {
          distanceMiles = d;
          nearest = p;
        }
      }
    }
    const regionFallback = distanceMiles == null;
    // For the label/region fallback, still surface a point even without coords:
    // the one in the closest region to the anchor.
    if (!nearest && myPoints.length && anchor) {
      nearest = [...myPoints].sort(
        (a, b) => regionRank(anchor.state, a.state) - regionRank(anchor.state, b.state),
      )[0];
    }
    const nearestOrigin: Place | null = nearest ? { city: nearest.city, state: nearest.state } : null;

    const ladder = ladderFor(judgedType, opts.ladders);
    const rpm = agentTypeRpm(agentLoads, judgedType);
    const typeLoadCount = agentTypeCount(agentLoads, judgedType);
    const rung = ladder?.minimum ?? null;
    const verdict = ladder && typeLoadCount >= VERDICT_MIN_LOADS ? verdictFor(rpm, ladder) : null;

    // One read of codeOf, so the code and its kind can never disagree.
    const worn = codeOf(agent);
    const rating = typeof agent.rating === "number" ? agent.rating : null;
    const spoken = lastTouch ? (lastTouch.get(agentId) ?? null) : undefined;

    const r: AgentRanking = {
      agentId,
      agentName: nameById.get(agentId) ?? "Agent",
      agencyCode: worn?.code ?? null,
      codeKind: worn?.kind ?? null,
      nearestOrigin,
      nearestSource: nearest?.source ?? null,
      distanceMiles,
      regionFallback,
      loadType: judgedType,
      book: bookOfType(judgedType),
      rpm,
      perDay: agentTypePerDay(agentLoads, judgedType),
      rung,
      rateDelta: rpm != null && rung != null ? rpm - rung : null,
      verdict,
      typeLoadCount,
      loadCount: card.loadCount,
      daysSince: card.daysSince,
      dwellLoads: card.moneyLostLoads,
      isNew: card.loadCount < MIN_SCORE_LOADS,
      rating,
      standing: standingOf(agent),
      avoid: rating === 2,
      lastSpokenTo: spoken ?? null,
      daysSinceSpoken:
        spoken === undefined ? undefined : spoken == null ? null : Math.max(0, daysBetweenKeys(spoken, nowKey)),
      secondCall: secondCall.has(agentId),
      score: 0,
      why: "",
    };
    // Rated 1 · Blacklist — your call. Never ranked; listed under its own
    // heading, nearest first, so you can see who is near the drop and why
    // you are not calling them.
    if (rating === 1) {
      blacklisted.push(r);
    } else {
      rankings.push(r);
      // "how many of the RANKED desks got real miles" — the footer's count.
      if (distanceMiles != null) withCoords++;
    }
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

  // MEASURED QUALITY ranks the call list; YOUR RATING breaks ties — where
  // Direct/Spot used to — and distance breaks what is left.
  rankings.sort(
    (a, b) =>
      b.score - a.score ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9),
  );
  blacklisted.sort(
    (a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9) || a.agentName.localeCompare(b.agentName),
  );
  if (anchor) {
    for (const r of rankings) r.why = whyLine(r, anchor);
    for (const r of blacklisted) r.why = whyLine(r, anchor);
  }

  return {
    anchor,
    anchorResolved: anchorCoord != null,
    focus,
    mode,
    rung: focus === "any" ? null : (ladderFor(focus, opts.ladders)?.minimum ?? null),
    rankings,
    blacklisted,
    coverage: { withCoords, total: rankings.length },
  };
};

// Agent display name — first + last, as the roster shows it.
function agentName(a: Agent): string {
  return `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Agent";
}

// Re-export for consumers that want the shared scorecard shape alongside.
export type { AgentScorecard };
