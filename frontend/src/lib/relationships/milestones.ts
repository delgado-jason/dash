// Milestone flags (REL-01 v2.0 §5C) — relationship-driven, no ask, rare per
// agent. dash flags the crossing; Dispatch sends the §7 ② note by hand.
//   load count     5 / 10 / 25 / 50 / 100 delivered loads together
//   streak         10 / 20 / 50 consecutive on-time, claim-free loads
//                  (decision 4: every GRADED stop not late by lib/detention's
//                  onTimeStatus and claim_filed false; a load with no graded
//                  stop is neutral — neither breaks nor extends the streak;
//                  a claim always breaks it)
//   anniversary    the first delivered load's date, each year, for 14 days
// A flag stays open until its marker lands on the record — sent as the
// contact note's prefix `[milestone:loads-10]`, or skipped as an agent note
// `[milestone:loads-10:skipped]` (see markers.ts). Only the HIGHEST crossed
// threshold of each kind is offered: "that was our 10th" at twelve loads is a
// note; "that was our 5th" is not. Optional milestones (miles, new lane) are
// not built. Pure; clock injected.
import { onTimeStatus } from "@/lib/detention";
import { daysBetweenKeys, keyOf, localDayKey, utcDayKey } from "./dayKeys";
import { hasMarker, type MarkerContactLike, type MarkerNoteLike } from "./markers";

export const LOAD_THRESHOLDS = [5, 10, 25, 50, 100] as const;
export const STREAK_THRESHOLDS = [10, 20, 50] as const;
export const ANNIVERSARY_WINDOW_DAYS = 14;

export type MilestoneKind = "loads" | "streak" | "anniversary";

export interface MilestoneLoadLike {
  agent_id?: string | null;
  load_status: string;
  load_number?: string;
  pickup_date?: string | null;
  delivery_date?: string | null;
  shipper_in?: string | null;
  pickup_appt_start?: string | null;
  pickup_appt_end?: string | null;
  receiver_in?: string | null;
  delivery_appt_start?: string | null;
  delivery_appt_end?: string | null;
  claim_filed?: boolean | null;
}

export interface MilestoneFlag<A> {
  agent: A;
  kind: MilestoneKind;
  n: number; // the threshold crossed — or the anniversary's year
  marker: string;
  crossedOn: string | null; // 'YYYY-MM-DD' the crossing happened (the anniversary day itself)
  label: string; // "5 loads" · "10 straight" · "1 year"
  years: number | null; // anniversary only — how many years together
}

export const milestoneMarker = (kind: MilestoneKind, n: number): string => `[milestone:${kind}-${n}]`;

// Delivered loads for the agent, oldest first — by the day they delivered,
// then picked up, then the load number, so the order is stable.
export const deliveredInOrder = <L extends MilestoneLoadLike>(loads: L[], agentId: string): L[] =>
  loads
    .filter((l) => l.agent_id === agentId && l.load_status === "delivered")
    .sort((a, b) => {
      const ka = keyOf(a.delivery_date ?? a.pickup_date ?? "");
      const kb = keyOf(b.delivery_date ?? b.pickup_date ?? "");
      return ka.localeCompare(kb) || keyOf(a.pickup_date ?? "").localeCompare(keyOf(b.pickup_date ?? "")) || (a.load_number ?? "").localeCompare(b.load_number ?? "");
    });

// One load's verdict for the streak: 'counts' (every graded stop on time,
// no claim), 'breaks' (a late graded stop or a claim), or 'neutral' (no stop
// graded and no claim — nothing to say either way).
export type StreakVerdict = "counts" | "breaks" | "neutral";

export const streakVerdict = (l: MilestoneLoadLike): StreakVerdict => {
  if (l.claim_filed === true) return "breaks";
  const stops = [
    onTimeStatus(l.pickup_appt_start, l.pickup_appt_end, l.shipper_in),
    onTimeStatus(l.delivery_appt_start, l.delivery_appt_end, l.receiver_in),
  ].filter((s): s is NonNullable<typeof s> => s != null);
  if (stops.length === 0) return "neutral";
  return stops.some((s) => s === "late") ? "breaks" : "counts";
};

export interface Streak {
  n: number; // counted loads in the current run
  reachedOn: Map<number, string | null>; // threshold → the delivery day the run reached it
}

// The CURRENT run: walk the delivered loads newest → oldest, counting the
// loads that count, skipping the neutral ones, stopping at the first breaker.
export const streakOf = (loads: MilestoneLoadLike[], agentId: string): Streak => {
  const ordered = deliveredInOrder(loads, agentId);
  const counted: MilestoneLoadLike[] = [];
  for (let i = ordered.length - 1; i >= 0; i--) {
    const v = streakVerdict(ordered[i]);
    if (v === "breaks") break;
    if (v === "counts") counted.unshift(ordered[i]);
  }
  const reachedOn = new Map<number, string | null>();
  for (const t of STREAK_THRESHOLDS) {
    if (counted.length >= t) {
      const l = counted[t - 1];
      reachedOn.set(t, l.delivery_date ? keyOf(l.delivery_date) : l.pickup_date ? keyOf(l.pickup_date) : null);
    }
  }
  return { n: counted.length, reachedOn };
};

const highestCrossed = (count: number, thresholds: readonly number[]): number | null => {
  let best: number | null = null;
  for (const t of thresholds) if (count >= t) best = t;
  return best;
};

// The first delivered load's day — the relationship's birthday.
export const firstLoadKey = (loads: MilestoneLoadLike[], agentId: string): string | null => {
  const first = deliveredInOrder(loads, agentId)[0];
  if (!first) return null;
  const raw = first.pickup_date ?? first.delivery_date;
  return raw ? keyOf(raw) : null;
};

// The anniversary that is live today, if any: the first load's month/day in
// the current or previous year, when today sits inside its 14-day window.
// "Today" is the LOCAL calendar day — Brandie's, like the holiday windows —
// so an evening after UTC midnight does not open or close a flag early.
// Returns the anniversary year (the marker's number) and the day.
export const liveAnniversary = (firstKey: string, now: Date): { year: number; day: string } | null => {
  const nowKey = localDayKey(now);
  const [fy, fm, fd] = firstKey.split("-").map(Number);
  const ny = Number(nowKey.slice(0, 4));
  for (const year of [ny, ny - 1]) {
    if (year <= fy) continue; // the first year is not an anniversary
    // Pure calendar arithmetic on the anniversary's y/m/d (no clock read):
    // Feb 29 rolls to Mar 1 in a common year via Date.UTC's own carry.
    const day = utcDayKey(new Date(Date.UTC(year, fm - 1, fd)));
    const since = daysBetweenKeys(day, nowKey);
    if (since >= 0 && since < ANNIVERSARY_WINDOW_DAYS) return { year, day };
  }
  return null;
};

const yearsLabel = (n: number) => (n === 1 ? "1 year" : `${n} years`);

// Every open flag for one agent, load count first, then streak, then the
// anniversary — the order the plate offers them.
export const milestoneFlagsFor = <A extends { agent_id: string }>(
  agent: A,
  loads: MilestoneLoadLike[],
  contacts: MarkerContactLike[],
  notes: MarkerNoteLike[],
  now: Date,
): MilestoneFlag<A>[] => {
  const out: MilestoneFlag<A>[] = [];
  const ordered = deliveredInOrder(loads, agent.agent_id);
  const open = (marker: string) => !hasMarker(agent.agent_id, marker, contacts, notes);

  const loadsT = highestCrossed(ordered.length, LOAD_THRESHOLDS);
  if (loadsT != null) {
    const marker = milestoneMarker("loads", loadsT);
    if (open(marker)) {
      const l = ordered[loadsT - 1];
      out.push({ agent, kind: "loads", n: loadsT, marker, crossedOn: l.delivery_date ? keyOf(l.delivery_date) : null, label: `${loadsT} loads`, years: null });
    }
  }

  const streak = streakOf(loads, agent.agent_id);
  const streakT = highestCrossed(streak.n, STREAK_THRESHOLDS);
  if (streakT != null) {
    const marker = milestoneMarker("streak", streakT);
    if (open(marker)) out.push({ agent, kind: "streak", n: streakT, marker, crossedOn: streak.reachedOn.get(streakT) ?? null, label: `${streakT} straight`, years: null });
  }

  const first = firstLoadKey(loads, agent.agent_id);
  const anniv = first ? liveAnniversary(first, now) : null;
  if (first && anniv) {
    const marker = milestoneMarker("anniversary", anniv.year);
    const years = anniv.year - Number(first.slice(0, 4));
    if (open(marker)) out.push({ agent, kind: "anniversary", n: anniv.year, marker, crossedOn: anniv.day, label: yearsLabel(years), years });
  }
  return out;
};

// The active book's open flags, in the caller's agent order (the caller
// passes tiered + prospect agents only — Parked gets no nurture).
export const milestoneFlags = <A extends { agent_id: string }>(
  activeAgents: A[],
  loads: MilestoneLoadLike[],
  contacts: MarkerContactLike[],
  notes: MarkerNoteLike[],
  now: Date,
): MilestoneFlag<A>[] => activeAgents.flatMap((a) => milestoneFlagsFor(a, loads, contacts, notes, now));

// The ordinal the note says — "5th", "10th", "25th".
export const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  return `${n}${mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th"}`;
};
