// Parked agents within 75 miles of where the truck goes empty next: hidden
// from the ranked rows, surfaced on the Foreman only when the truck is near
// their freight — grab a board load out of their town. Pure.
//
// Parked = the owner's explicit call (work_status 'parked'), and nothing else.
// Until v1.293.0 a desk with nothing two-way in 180 days was ALSO treated as
// parked ("dormant", REL-01 v2.0 §4) and left the Foreman with no word on its
// file; an email never counted as two-way, so September's reached calls were
// the last thing keeping most of the book on the board. Under the rating-only
// rule (Jason, Nov 15, 2026) silence is a fact printed on the row — "68 d
// since you spoke" — not a verdict that hides the row.
//
// Their footprint = their delivered loads' FOOTPRINT POINTS (the origin, or
// the destination when the agent's customer took delivery — decision 5A; a
// 'neither' load contributes nothing) plus the markets they named
// (agent_coverage), each resolved through the same coordinate cache the
// Foreman ranks with; the NEAREST point decides. An agent with no point that
// resolves to a coordinate is left out — never a guessed distance.
// Straight-line miles, like the Foreman.
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import { cityKey, haversineMiles, type CoordMap } from "./foreman";
import { footprintPoint } from "@/lib/loads/customerEnd";
import { loadGross } from "./rateTargets";
import { deliveredCount, lastLoadKey } from "./agentRpm";
import { daysBetweenKeys, keyOf, utcDayKey } from "@/lib/dates/dayKeys";
import { isDelivered } from "./status";

export const PARKED_RADIUS_MILES = 75;

export interface ParkedNearbyRow {
  agent: Agent;
  place: { city: string; state: string }; // the nearest footprint point
  miles: number;
  delivered: number;
  gross: number; // Σ gross over their DELIVERED loads — "1 · $2,700"
  reason: string | null; // the owner's written reason
  lastWorked: string | null; // the last delivered load's day, 'YYYY-MM-DD'
  // Days since the last logged touch of any kind — a call, an email, a text,
  // either direction. null = never; undefined = not known (the contact log
  // did not come through), the same reading AgentRow gives it.
  daysSinceSpoken: number | null | undefined;
}

export interface CoverageLike {
  agent_id: string;
  city: string;
  state: string;
}

/** A touch, as the row needs it — who and when. */
export interface TouchLike {
  agent_id: string;
  contacted_at: string;
}

type Anchor = { city: string; state: string } | null;

/** The newest touch per agent, as a UTC day key. */
export const lastTouchByAgent = (contacts: TouchLike[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const c of contacts) {
    if (!c.agent_id || !c.contacted_at) continue;
    const k = keyOf(c.contacted_at);
    const cur = m.get(c.agent_id);
    if (cur == null || k > cur) m.set(c.agent_id, k);
  }
  return m;
};

// `contacts` null = the log is not available: the parks are still listed,
// their quiet days read undefined — never a number built from half the evidence.
export const parkedNearby = (
  agents: Agent[],
  loads: Load[],
  coverage: CoverageLike[],
  coords: CoordMap,
  anchor: Anchor,
  contacts: TouchLike[] | null,
  now: Date,
  radius = PARKED_RADIUS_MILES,
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
    if (!isDelivered(l)) continue; // booked / cancelled never count
    const p = footprintPoint(l); // follows the load's customer-end mark
    push(l.agent_id, p?.city, p?.state);
    if (l.agent_id) grossBy.set(l.agent_id, (grossBy.get(l.agent_id) ?? 0) + loadGross(l));
  }
  for (const c of coverage) push(c.agent_id, c.city, c.state);

  const nowKey = utcDayKey(now);
  const lastTouch = contacts ? lastTouchByAgent(contacts) : null;
  const out: ParkedNearbyRow[] = [];
  for (const agent of agents) {
    if (agent.work_status !== "parked") continue;
    let nearest: { place: { city: string; state: string }; miles: number } | null = null;
    for (const p of points.get(agent.agent_id) ?? []) {
      const c = coords.get(cityKey(p.city, p.state));
      if (!c) continue;
      const d = haversineMiles(anchorCoord, c);
      if (!nearest || d < nearest.miles) nearest = { place: p, miles: d };
    }
    if (!nearest || nearest.miles > radius) continue; // exactly the radius is in
    const spoken = lastTouch ? (lastTouch.get(agent.agent_id) ?? null) : undefined;
    out.push({
      agent,
      place: nearest.place,
      miles: nearest.miles,
      delivered: deliveredCount(loads, agent.agent_id),
      gross: grossBy.get(agent.agent_id) ?? 0,
      reason: agent.park_reason?.trim() || null,
      lastWorked: lastLoadKey(loads, agent.agent_id),
      daysSinceSpoken:
        spoken === undefined ? undefined : spoken == null ? null : Math.max(0, daysBetweenKeys(spoken, nowKey)),
    });
  }
  return out.sort((x, y) => x.miles - y.miles || `${x.agent.last_name} ${x.agent.first_name}`.localeCompare(`${y.agent.last_name} ${y.agent.first_name}`));
};
