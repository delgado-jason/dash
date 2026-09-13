// Parked agents within 75 miles of where the truck goes empty next (REL-01
// v2.0 §4): hidden from every list, surfaced on the Foreman ONLY when the
// truck is near their freight — harvest it, no outreach owed. Pure.
//
// Parked = the owner's explicit call (work_status 'parked') OR dormant by
// derivation (no tier, nothing two-way in 180 days — lib/relationships/
// buckets). Their footprint = their delivered loads' FOOTPRINT POINTS (the
// origin, or the destination when the agent's customer took delivery —
// decision 5A; a 'neither' load contributes nothing) plus the markets they
// named (agent_coverage), each resolved through the same coordinate cache the
// Foreman ranks with; the NEAREST point decides. An agent with no point that
// resolves to a coordinate is left out — never a guessed distance.
// Straight-line miles, like the Foreman.
//
// Two doors: `parkedNearby` judges dormancy off the contact log;
// `parkedNearbyExplicitOnly` is for a log that has not landed (in flight, or
// failed) — only the owner's explicit parks are listed and their quiet days
// are withheld, because half the evidence is not a verdict.
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import { cityKey, haversineMiles, type CoordMap } from "@/lib/metrics/foreman";
import { footprintPoint } from "@/lib/loads/customerEnd";
import { loadGross } from "@/lib/metrics/rateTargets";
import { bucketOf } from "./buckets";
import { lastMeaningfulContact, type MeaningfulContactLike } from "./meaningfulContact";
import { deliveredCount, lastLoadKey } from "./agentRpm";
import { daysBetweenKeys, keyOf, utcDayKey } from "./dayKeys";

export const PARKED_RADIUS_MILES = 75;

export interface ParkedNearbyRow {
  agent: Agent;
  place: { city: string; state: string }; // the nearest footprint point
  miles: number;
  delivered: number;
  gross: number; // Σ gross over their DELIVERED loads — "1 · $2,700"
  dormant: boolean; // derived-parked (no owner decision on record)
  since: string | null; // dormant: the day they went quiet — 'YYYY-MM-DD'
  reason: string | null; // explicit: the owner's written reason
  // Days since the last two-way contact or load day, whichever is later —
  // the call list's "quiet". null = never; undefined = not known (the
  // contact log did not come through), the same reading AgentRow gives it.
  daysQuiet: number | null | undefined;
}

export interface CoverageLike {
  agent_id: string;
  city: string;
  state: string;
}

type Anchor = { city: string; state: string } | null;

// `contacts` null = the log is not available: explicit parks only, quiet
// days withheld.
const collect = (
  agents: Agent[],
  loads: Load[],
  coverage: CoverageLike[],
  coords: CoordMap,
  anchor: Anchor,
  contacts: MeaningfulContactLike[] | null,
  now: Date,
  radius: number,
): ParkedNearbyRow[] => {
  if (!anchor) return [];
  const anchorCoord = coords.get(cityKey(anchor.city, anchor.state));
  if (!anchorCoord) return []; // the anchor itself has no trusted coordinate — nothing to measure from

  // Footprint points per agent: delivered loads' footprint points + stated markets.
  const points = new Map<string, { city: string; state: string }[]>();
  const push = (agentId: string | null | undefined, city: string | null | undefined, state: string | null | undefined) => {
    if (!agentId || !city || !state) return;
    (points.get(agentId) ?? points.set(agentId, []).get(agentId)!).push({ city, state });
  };
  const grossBy = new Map<string, number>();
  for (const l of loads) {
    if (l.load_status !== "delivered") continue; // booked / cancelled never count
    const p = footprintPoint(l); // follows the load's customer-end mark
    push(l.agent_id, p?.city, p?.state);
    if (l.agent_id) grossBy.set(l.agent_id, (grossBy.get(l.agent_id) ?? 0) + loadGross(l));
  }
  for (const c of coverage) push(c.agent_id, c.city, c.state);

  const nowKey = utcDayKey(now);
  const ctx = contacts ? { loads, contacts, now } : null;
  const isParked = (agent: Agent): boolean => (ctx ? bucketOf(agent, ctx) === "parked" : agent.work_status === "parked");
  const out: ParkedNearbyRow[] = [];
  for (const agent of agents) {
    if (!isParked(agent)) continue;
    let nearest: { place: { city: string; state: string }; miles: number } | null = null;
    for (const p of points.get(agent.agent_id) ?? []) {
      const c = coords.get(cityKey(p.city, p.state));
      if (!c) continue;
      const d = haversineMiles(anchorCoord, c);
      if (!nearest || d < nearest.miles) nearest = { place: p, miles: d };
    }
    if (!nearest || nearest.miles > radius) continue; // exactly the radius is in
    const explicit = agent.work_status === "parked";
    const lastTwoWay = contacts ? lastMeaningfulContact(agent.agent_id, contacts, loads) : null;
    out.push({
      agent,
      place: nearest.place,
      miles: nearest.miles,
      delivered: deliveredCount(loads, agent.agent_id),
      gross: grossBy.get(agent.agent_id) ?? 0,
      dormant: !explicit,
      since: explicit ? null : lastTwoWay ?? lastLoadKey(loads, agent.agent_id) ?? (agent.created_at ? keyOf(agent.created_at) : null),
      reason: explicit ? agent.park_reason?.trim() || null : null,
      daysQuiet: contacts ? (lastTwoWay ? Math.max(0, daysBetweenKeys(lastTwoWay, nowKey)) : null) : undefined,
    });
  }
  return out.sort((x, y) => x.miles - y.miles || `${x.agent.last_name} ${x.agent.first_name}`.localeCompare(`${y.agent.last_name} ${y.agent.first_name}`));
};

export const parkedNearby = (
  agents: Agent[],
  loads: Load[],
  coverage: CoverageLike[],
  coords: CoordMap,
  anchor: Anchor,
  contacts: MeaningfulContactLike[],
  now: Date,
  radius = PARKED_RADIUS_MILES,
): ParkedNearbyRow[] => collect(agents, loads, coverage, coords, anchor, contacts, now, radius);

// The contact log is not available (in flight, or it failed): dormancy cannot
// be judged, so only `work_status === 'parked'` agents are listed and their
// `daysQuiet` reads undefined — never a number built from half the evidence.
export const parkedNearbyExplicitOnly = (
  agents: Agent[],
  loads: Load[],
  coverage: CoverageLike[],
  coords: CoordMap,
  anchor: Anchor,
  now: Date,
  radius = PARKED_RADIUS_MILES,
): ParkedNearbyRow[] => collect(agents, loads, coverage, coords, anchor, null, now, radius);
