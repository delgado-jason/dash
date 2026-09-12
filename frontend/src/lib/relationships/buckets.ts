// The five buckets (REL-01 v2.0 §4), DERIVED — never stored (decisions 7–8).
//   explicit first:  work_status 'parked'      → Parked
//                    relationship_tier 1/2/3   → that tier (the owner's call,
//                                                even under three loads — the
//                                                book shows it with a chip)
//   no owner-set tier: a Prospect if any load, any two-way contact, or the
//                    record itself is inside the last 180 days; otherwise
//                    dormant → Parked (derived). Both wear the PARKED chip;
//                    the sub-line says which.
// partitionBook adds one more shelf the SOP implies: NEEDS A TIER — an
// established agent (≥3 delivered) the owner has not placed yet.
import { daysBetweenKeys, keyOf, utcDayKey } from "./dayKeys";
import {
  lastMeaningfulContact,
  type MeaningfulContactLike,
  type MeaningfulLoadLike,
} from "./meaningfulContact";
import { isEstablished } from "./tierSuggestion";

export type Bucket = "tier1" | "tier2" | "tier3" | "prospect" | "parked";

export const DORMANT_DAYS = 180;

export interface BookAgentLike {
  agent_id: string;
  first_name: string;
  last_name: string;
  relationship_tier: number | null;
  work_status?: "active" | "parked";
  created_at?: string;
}

export interface BookCtx {
  loads: MeaningfulLoadLike[];
  contacts: MeaningfulContactLike[];
  now: Date;
  // false when the loads slice did not come through. Dormancy and the ≥3-load
  // gate both read loads, so with it missing no untiered agent is shelved
  // Parked by derivation and NEEDS A TIER stays empty — the book shows the
  // owner's explicit calls and withholds every verdict it cannot make.
  loadsReady?: boolean;
}

const withinDays = (key: string | null, nowKey: string, days: number): boolean =>
  key != null && daysBetweenKeys(key, nowKey) <= days;

// Nothing two-way in 180 days — no load, no reached call, no inbound — and
// the record is older than that too.
export const isDormant = (
  agent: BookAgentLike,
  loads: MeaningfulLoadLike[],
  contacts: MeaningfulContactLike[],
  now: Date,
): boolean => {
  const nowKey = utcDayKey(now);
  if (withinDays(lastMeaningfulContact(agent.agent_id, contacts, loads), nowKey, DORMANT_DAYS)) return false;
  // Loads that never became two-way (a cancelled booking) still show the agent
  // was in play — lastMeaningfulContact skips them, so check pickups directly.
  for (const l of loads) {
    if (l.agent_id !== agent.agent_id || !l.pickup_date) continue;
    if (withinDays(keyOf(l.pickup_date), nowKey, DORMANT_DAYS)) return false;
  }
  if (agent.created_at && withinDays(keyOf(agent.created_at), nowKey, DORMANT_DAYS)) return false;
  return true;
};

export const tierBucket = (tier: number | null | undefined): Bucket | null =>
  tier === 1 ? "tier1" : tier === 2 ? "tier2" : tier === 3 ? "tier3" : null;

export const bucketOf = (agent: BookAgentLike, ctx: BookCtx): Bucket => {
  if (agent.work_status === "parked") return "parked";
  const explicit = tierBucket(agent.relationship_tier);
  if (explicit) return explicit;
  if (ctx.loadsReady === false) return "prospect"; // dormancy can't be judged without loads
  return isDormant(agent, ctx.loads, ctx.contacts, ctx.now) ? "parked" : "prospect";
};

export const bucketLabel = (b: Bucket): string =>
  b === "tier1" ? "Tier 1" : b === "tier2" ? "Tier 2" : b === "tier3" ? "Tier 3" : b === "prospect" ? "Prospect" : "Parked";

export interface BookPartition<A> {
  tier1: A[];
  tier2: A[];
  tier3: A[];
  needsTier: A[]; // established, no owner-set tier, not dormant
  prospects: A[];
  parked: A[]; // explicit AND dormant-derived
}

export type BookSort = "loads" | "quiet" | "name";

interface Ranked {
  delivered: number;
  daysSince: number | null; // null = never — sorts as the quietest
}

const nameKey = (a: BookAgentLike) => `${a.last_name} ${a.first_name}`.trim().toLowerCase();

const comparator =
  <A extends BookAgentLike>(sort: BookSort, rank: Map<string, Ranked>) =>
  (x: A, y: A): number => {
    const rx = rank.get(x.agent_id)!;
    const ry = rank.get(y.agent_id)!;
    const quiet = (r: Ranked) => (r.daysSince == null ? Number.POSITIVE_INFINITY : r.daysSince);
    const byName = nameKey(x).localeCompare(nameKey(y));
    if (sort === "name") return byName;
    if (sort === "quiet") return quiet(ry) - quiet(rx) || ry.delivered - rx.delivered || byName;
    // "loads": most loads, then longest since a two-way contact, then name
    return ry.delivered - rx.delivered || quiet(ry) - quiet(rx) || byName;
  };

// The book, shelved. Tiers / prospects / needs-a-tier sort by loads then quiet
// by default; parked sorts by name — unless a sort is asked for explicitly,
// which then applies everywhere.
export const partitionBook = <A extends BookAgentLike>(
  agents: A[],
  ctx: BookCtx,
  sort?: BookSort,
): BookPartition<A> => {
  const nowKey = utcDayKey(ctx.now);
  const delivered = new Map<string, number>();
  for (const l of ctx.loads) {
    if (!l.agent_id || l.load_status !== "delivered") continue;
    delivered.set(l.agent_id, (delivered.get(l.agent_id) ?? 0) + 1);
  }
  const rank = new Map<string, Ranked>();
  const out: BookPartition<A> = { tier1: [], tier2: [], tier3: [], needsTier: [], prospects: [], parked: [] };
  for (const a of agents) {
    const last = lastMeaningfulContact(a.agent_id, ctx.contacts, ctx.loads);
    rank.set(a.agent_id, {
      delivered: delivered.get(a.agent_id) ?? 0,
      daysSince: last == null ? null : Math.max(0, daysBetweenKeys(last, nowKey)),
    });
    const b = bucketOf(a, ctx);
    if (b === "prospect" && ctx.loadsReady !== false && isEstablished(delivered.get(a.agent_id) ?? 0)) out.needsTier.push(a);
    else if (b === "prospect") out.prospects.push(a);
    else out[b].push(a);
  }
  const shelf = comparator<A>(sort ?? "loads", rank);
  out.tier1.sort(shelf);
  out.tier2.sort(shelf);
  out.tier3.sort(shelf);
  out.needsTier.sort(shelf);
  out.prospects.sort(shelf);
  out.parked.sort(comparator<A>(sort ?? "name", rank));
  return out;
};
