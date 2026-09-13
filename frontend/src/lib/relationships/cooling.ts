// Cooling (REL-01 v2.0 §4) — monitoring for the OWNER, never a to-do for
// Dispatch. A tiered agent with no meaningful (two-way) contact past the
// threshold for their CURRENT tier is flagged:
//   Tier 1  21 days · Tier 2  42 days · Tier 3  90 days
// measured from lastMeaningfulContact (decision 3): anything inbound, a
// reached call, or a load. Voicemails, capacity emails and milestone notes do
// not reset it. Prospects and Parked never cool — Parked as the BOOK reads it
// (lib/relationships/buckets): the owner's shelf and the dormant shelf alike.
// The flag prompts the Owner to consider a personal touch and feeds the
// re-tier suggestion; it never creates a task and never fires an email.
import { bucketOf, isDormant, type BookAgentLike, type BookCtx } from "./buckets";
import { daysBetweenKeys, utcDayKey } from "./dayKeys";
import { lastMeaningfulContact, type MeaningfulContactLike, type MeaningfulLoadLike } from "./meaningfulContact";

export const COOLING_THRESHOLD_DAYS: Record<1 | 2 | 3, number> = { 1: 21, 2: 42, 3: 90 };

// How far ahead the section looks for "flags {date} if nothing changes".
export const COOLING_WATCH_DAYS = 14;

// A cooling row asks the book which shelf the agent is on before it asks how
// quiet they are, so it needs exactly what the bucket needs.
export type CoolingAgentLike = BookAgentLike;

export interface CoolingRow<A> {
  agent: A;
  tier: 1 | 2 | 3;
  last: string | null; // 'YYYY-MM-DD' of the last two-way contact; null = never
  days: number | null; // whole days since it, clamped at 0; null = never
  // The last non-cancelled load day (delivery, else pickup) — null = never ran.
  // A load IS a two-way contact, so this is usually `last`; it differs when a
  // call or an inbound message came after the freight, which is exactly the
  // pair the Review prints ("last two-way contact Sep 8 · last load Aug 31").
  lastLoad: string | null;
  threshold: number;
  flagged: boolean; // at or past the threshold (or never a two-way contact)
  flagsOn: string | null; // the day it flags if nothing changes; null once flagged or never-contacted
}

const shiftKey = (k: string, days: number): string => utcDayKey(new Date(Date.parse(`${k}T00:00:00Z`) + days * 86_400_000));

const tierOf = (t: number | null): 1 | 2 | 3 | null => (t === 1 || t === 2 || t === 3 ? t : null);

// The agent's most recent load day — delivery when there is one, else pickup —
// over non-cancelled loads. Same rule as agentRpm's lastLoadKey, on the lighter
// shape this module already takes.
const lastLoadDay = (agentId: string, loads: MeaningfulLoadLike[]): string | null => {
  let max: string | null = null;
  for (const l of loads) {
    if (l.agent_id !== agentId || l.load_status === "cancelled") continue;
    const raw = l.delivery_date ?? l.pickup_date;
    if (!raw) continue;
    const k = raw.slice(0, 10);
    if (max == null || k > max) max = k;
  }
  return max;
};

// One row per tiered, unparked agent — the caller decides what to show.
export const coolingRows = <A extends CoolingAgentLike>(
  agents: A[],
  contacts: MeaningfulContactLike[],
  loads: MeaningfulLoadLike[],
  now: Date,
): CoolingRow<A>[] => {
  const nowKey = utcDayKey(now);
  const ctx: BookCtx = { loads, contacts, now };
  const out: CoolingRow<A>[] = [];
  for (const a of agents) {
    const tier = tierOf(a.relationship_tier);
    if (tier == null) continue; // prospects never cool
    // Parked never cools — the owner's shelf (bucketOf) and the dormant one.
    // bucketOf answers with the owner's TIER before it ever weighs dormancy,
    // so a tiered agent nobody has heard from in 180 days needs the dormancy
    // question asked outright: nothing two-way, no freight and a record older
    // than that is not cooling, it is gone, and the quarter's RISERS is the
    // door back.
    if (bucketOf(a, ctx) === "parked" || isDormant(a, loads, contacts, now)) continue;
    const threshold = COOLING_THRESHOLD_DAYS[tier];
    const last = lastMeaningfulContact(a.agent_id, contacts, loads);
    const days = last == null ? null : Math.max(0, daysBetweenKeys(last, nowKey));
    const flagged = days == null || days >= threshold;
    out.push({
      agent: a,
      tier,
      last,
      days,
      lastLoad: lastLoadDay(a.agent_id, loads),
      threshold,
      flagged,
      flagsOn: flagged || last == null ? null : shiftKey(last, threshold),
    });
  }
  return out;
};

export interface CoolingSection<A> {
  flagged: CoolingRow<A>[]; // past the threshold — quietest first
  watch: CoolingRow<A>[]; // under it, flagging inside COOLING_WATCH_DAYS — soonest first
}

// What Today shows: the flagged rows plus the ones about to flag.
export const coolingSection = <A extends CoolingAgentLike>(
  agents: A[],
  contacts: MeaningfulContactLike[],
  loads: MeaningfulLoadLike[],
  now: Date,
  watchDays = COOLING_WATCH_DAYS,
): CoolingSection<A> => {
  const rows = coolingRows(agents, contacts, loads, now);
  const nowKey = utcDayKey(now);
  const quiet = (r: CoolingRow<A>) => (r.days == null ? Number.POSITIVE_INFINITY : r.days);
  const flagged = rows.filter((r) => r.flagged).sort((x, y) => quiet(y) - quiet(x));
  const watch = rows
    .filter((r) => !r.flagged && r.flagsOn != null && daysBetweenKeys(nowKey, r.flagsOn) <= watchDays)
    .sort((x, y) => x.flagsOn!.localeCompare(y.flagsOn!));
  return { flagged, watch };
};
