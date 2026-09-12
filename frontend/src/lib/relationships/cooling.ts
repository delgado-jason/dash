// Cooling (REL-01 v2.0 §4) — monitoring for the OWNER, never a to-do for
// Dispatch. A tiered agent with no meaningful (two-way) contact past the
// threshold for their CURRENT tier is flagged:
//   Tier 1  21 days · Tier 2  42 days · Tier 3  90 days
// measured from lastMeaningfulContact (decision 3): anything inbound, a
// reached call, or a load. Voicemails, capacity emails and milestone notes do
// not reset it. Prospects and Parked never cool. The flag prompts the Owner to
// consider a personal touch and feeds the re-tier suggestion; it never creates
// a task and never fires an email.
import { daysBetweenKeys, utcDayKey } from "./dayKeys";
import { lastMeaningfulContact, type MeaningfulContactLike, type MeaningfulLoadLike } from "./meaningfulContact";

export const COOLING_THRESHOLD_DAYS: Record<1 | 2 | 3, number> = { 1: 21, 2: 42, 3: 90 };

// How far ahead the section looks for "flags {date} if nothing changes".
export const COOLING_WATCH_DAYS = 14;

export interface CoolingAgentLike {
  agent_id: string;
  relationship_tier: number | null;
  work_status?: "active" | "parked";
}

export interface CoolingRow<A> {
  agent: A;
  tier: 1 | 2 | 3;
  last: string | null; // 'YYYY-MM-DD' of the last two-way contact; null = never
  days: number | null; // whole days since it, clamped at 0; null = never
  threshold: number;
  flagged: boolean; // at or past the threshold (or never a two-way contact)
  flagsOn: string | null; // the day it flags if nothing changes; null once flagged or never-contacted
}

const shiftKey = (k: string, days: number): string => utcDayKey(new Date(Date.parse(`${k}T00:00:00Z`) + days * 86_400_000));

const tierOf = (t: number | null): 1 | 2 | 3 | null => (t === 1 || t === 2 || t === 3 ? t : null);

// One row per tiered, unparked agent — the caller decides what to show.
export const coolingRows = <A extends CoolingAgentLike>(
  agents: A[],
  contacts: MeaningfulContactLike[],
  loads: MeaningfulLoadLike[],
  now: Date,
): CoolingRow<A>[] => {
  const nowKey = utcDayKey(now);
  const out: CoolingRow<A>[] = [];
  for (const a of agents) {
    const tier = tierOf(a.relationship_tier);
    if (tier == null || a.work_status === "parked") continue; // prospects and parked never cool
    const threshold = COOLING_THRESHOLD_DAYS[tier];
    const last = lastMeaningfulContact(a.agent_id, contacts, loads);
    const days = last == null ? null : Math.max(0, daysBetweenKeys(last, nowKey));
    const flagged = days == null || days >= threshold;
    out.push({
      agent: a,
      tier,
      last,
      days,
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
