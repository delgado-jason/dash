// The agent-relationship brain (Jason, 2026-09-03; approved mockups).
// Doctrine: tiers are the OWNER'S call; every lifecycle state is DERIVED
// (an agent with zero loads IS a prospect); last-contacted is always MAX over
// the contact log; attribution lives on the load and legacy nulls sit outside
// every denominator. Pure + clock-injected throughout.
import type { Load } from "@/types/load";

// The day the relationship system went live — the inbound gauge's baseline.
export const SYSTEM_START = "2026-09-03";

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface ContactLike {
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  method: "call" | "email" | "text";
  type: "capacity" | "check_in" | "appreciation" | "close_out" | "cold" | "inbound_inquiry" | "other";
  load_id?: string | null;
}

export interface AgentLike {
  agent_id: string;
  first_name: string;
  last_name: string;
  relationship_tier: number; // 1 | 2 | 3
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
}

// Days a tier may go untouched before a touch is DUE. T1 weekly, T2
// bi-weekly, T3 quarterly. Prospects override below.
export const TIER_CADENCE_DAYS: Record<number, number> = { 1: 7, 2: 14, 3: 90 };
// Cold follow-ups: an unanswered cold touch resurfaces in 14 days; a REPLIED
// prospect tightens to 7 — momentum dies fast.
export const COLD_FOLLOWUP_DAYS = 14;
export const REPLIED_FOLLOWUP_DAYS = 7;

export const lastTouchOf = (
  agentId: string,
  contacts: ContactLike[],
): string | null => {
  let max: string | null = null;
  for (const c of contacts)
    if (c.agent_id === agentId && (max == null || c.contacted_at > max))
      max = c.contacted_at;
  return max;
};

export type ProspectStage = "prospect" | "touched" | "replied" | "converted";

export interface ProspectState {
  stage: ProspectStage;
  coldTouches: number;
  // Days from first cold touch to first load — the conversion time (converted only).
  daysToConvert: number | null;
}

// Derived, never stored: loads decide "converted", the contact log decides
// the rest. An agent with loads is NEVER a prospect regardless of contacts.
export const prospectState = (
  agentId: string,
  contacts: ContactLike[],
  loads: Load[],
): ProspectState => {
  const mine = contacts.filter((c) => c.agent_id === agentId);
  const coldTouches = mine.filter((c) => c.direction === "outbound" && c.type === "cold").length;
  const firstLoad = loads
    .filter((l) => l.agent_id === agentId && l.load_status !== "cancelled" && l.pickup_date)
    .map((l) => l.pickup_date.slice(0, 10))
    .sort()[0];
  if (firstLoad) {
    const firstCold = mine
      .filter((c) => c.direction === "outbound" && c.type === "cold")
      .map((c) => c.contacted_at.slice(0, 10))
      .sort()[0];
    const daysToConvert =
      firstCold && firstCold <= firstLoad
        ? Math.round((Date.parse(`${firstLoad}T00:00:00Z`) - Date.parse(`${firstCold}T00:00:00Z`)) / DAY)
        : null;
    return { stage: "converted", coldTouches, daysToConvert };
  }
  if (mine.some((c) => c.direction === "inbound")) return { stage: "replied", coldTouches, daysToConvert: null };
  if (coldTouches > 0) return { stage: "touched", coldTouches, daysToConvert: null };
  return { stage: "prospect", coldTouches: 0, daysToConvert: null };
};

export interface DueEntry {
  agent: AgentLike;
  daysSince: number | null; // null = never touched
  dueBy: number; // the cadence that applies
  overdueDays: number; // how far past due (0 = due today)
  reason: string; // plain words for the queue row
}

// Who's owed a touch, most-overdue first. Prospects ride their own cadence;
// tiered working agents ride TIER_CADENCE_DAYS. Never-touched counts as
// infinitely overdue within its class (surfaces immediately).
export const dueQueue = (
  agents: AgentLike[],
  contacts: ContactLike[],
  loads: Load[],
  now: Date,
): DueEntry[] => {
  const nowMs = now.getTime();
  const out: DueEntry[] = [];
  for (const a of agents) {
    const st = prospectState(a.agent_id, contacts, loads);
    const last = lastTouchOf(a.agent_id, contacts);
    const daysSince = last == null ? null : Math.floor((nowMs - Date.parse(last)) / DAY);
    let dueBy: number;
    let reason: string;
    if (st.stage === "touched") {
      dueBy = COLD_FOLLOWUP_DAYS;
      reason = `cold follow-up — ${st.coldTouches} touch${st.coldTouches === 1 ? "" : "es"}, no reply yet`;
    } else if (st.stage === "replied") {
      dueBy = REPLIED_FOLLOWUP_DAYS;
      reason = "they replied — keep the momentum";
    } else if (st.stage === "prospect") {
      // Un-touched prospects don't nag on a clock — cold outreach is pulled
      // from the pool deliberately, not pushed by the queue.
      continue;
    } else {
      dueBy = TIER_CADENCE_DAYS[a.relationship_tier] ?? 90;
      reason = `tier ${a.relationship_tier} cadence — every ${dueBy}d`;
    }
    const overdueDays = daysSince == null ? dueBy : daysSince - dueBy;
    if (overdueDays >= 0) out.push({ agent: a, daysSince, dueBy, overdueDays, reason });
  }
  return out.sort((x, y) => y.overdueDays - x.overdueDays);
};

// Tuesday's call: the TIER-2 agent who's waited longest (never-touched first).
export const tuesdayPick = (
  agents: AgentLike[],
  contacts: ContactLike[],
  now: Date,
): { agent: AgentLike; daysSince: number | null } | null => {
  const t2 = agents.filter((a) => a.relationship_tier === 2);
  if (t2.length === 0) return null;
  let best: { agent: AgentLike; last: string | null } | null = null;
  for (const a of t2) {
    const last = lastTouchOf(a.agent_id, contacts);
    if (best == null) best = { agent: a, last };
    else if (last == null && best.last != null) best = { agent: a, last };
    else if (last != null && best.last != null && last < best.last) best = { agent: a, last };
  }
  return best
    ? {
        agent: best.agent,
        daysSince: best.last == null ? null : Math.floor((now.getTime() - Date.parse(best.last)) / DAY),
      }
    : null;
};

// Friday's appreciation list: Tier-1 agents with a DELIVERED load this week
// (week = the trailing 7 days ending `now`).
export const fridayList = (
  agents: AgentLike[],
  loads: Load[],
  now: Date,
): { agent: AgentLike; loads: number }[] => {
  const start = dayKey(new Date(now.getTime() - 6 * DAY));
  const end = dayKey(now);
  const t1 = new Map(agents.filter((a) => a.relationship_tier === 1).map((a) => [a.agent_id, a]));
  const counts = new Map<string, number>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.delivery_date || !l.agent_id) continue;
    const k = l.delivery_date.slice(0, 10);
    if (k < start || k > end) continue;
    if (!t1.has(l.agent_id)) continue;
    counts.set(l.agent_id, (counts.get(l.agent_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ agent: t1.get(id)!, loads: n }))
    .sort((a, b) => b.loads - a.loads);
};

// Delivered loads (trailing `days`) with NO close-out contact linked yet.
export const closeOutPending = (
  loads: Load[],
  contacts: ContactLike[],
  now: Date,
  days = 7,
): Load[] => {
  const start = dayKey(new Date(now.getTime() - (days - 1) * DAY));
  const closed = new Set(
    contacts.filter((c) => c.type === "close_out" && c.load_id).map((c) => c.load_id),
  );
  return loads.filter(
    (l) =>
      l.load_status === "delivered" &&
      l.delivery_date &&
      l.delivery_date.slice(0, 10) >= start &&
      l.delivery_date.slice(0, 10) <= dayKey(now) &&
      !closed.has(l.load_id),
  );
};

export interface InboundShare {
  attributed: number; // loads carrying a booked_via
  inbound: number;
  share: number | null; // inbound ÷ attributed; null when nothing attributed
}

const shareOf = (loads: Load[]): InboundShare => {
  const attributed = loads.filter((l) => l.booked_via != null);
  const inbound = attributed.filter((l) => l.booked_via === "agent_reached_out").length;
  return {
    attributed: attributed.length,
    inbound,
    share: attributed.length > 0 ? inbound / attributed.length : null,
  };
};

// The system's one number, at every altitude: fleet-wide, per tier, per
// agent. Booked (non-cancelled) loads in [fromKey, toKey]; legacy nulls out.
export const inboundShare = (
  loads: Load[],
  fromKey: string,
  toKey: string,
): InboundShare =>
  shareOf(
    loads.filter(
      (l) =>
        l.load_status !== "cancelled" &&
        !!l.pickup_date &&
        l.pickup_date.slice(0, 10) >= fromKey &&
        l.pickup_date.slice(0, 10) <= toKey,
    ),
  );

export const inboundByTier = (
  agents: AgentLike[],
  loads: Load[],
  fromKey: string,
  toKey: string,
): Record<number, InboundShare> => {
  const tierOf = new Map(agents.map((a) => [a.agent_id, a.relationship_tier]));
  const windowed = loads.filter(
    (l) =>
      l.load_status !== "cancelled" &&
      !!l.pickup_date &&
      l.pickup_date.slice(0, 10) >= fromKey &&
      l.pickup_date.slice(0, 10) <= toKey,
  );
  const out: Record<number, InboundShare> = {};
  for (const t of [1, 2, 3])
    out[t] = shareOf(windowed.filter((l) => l.agent_id && tierOf.get(l.agent_id) === t));
  return out;
};

// Monthly inbound-share series for the trend (months with ≥1 attributed load).
export const inboundTrend = (
  loads: Load[],
): { month: string; share: number; attributed: number }[] => {
  const byMonth = new Map<string, Load[]>();
  for (const l of loads) {
    if (l.load_status === "cancelled" || !l.pickup_date || l.booked_via == null) continue;
    const k = l.pickup_date.slice(0, 7);
    const arr = byMonth.get(k) ?? [];
    arr.push(l);
    byMonth.set(k, arr);
  }
  return [...byMonth.keys()]
    .sort()
    .map((k) => {
      const s = shareOf(byMonth.get(k)!);
      return { month: k, share: s.share ?? 0, attributed: s.attributed };
    });
};

export interface ColdFunnel {
  pool: number; // agents with zero loads
  touched: number;
  replied: number;
  converted: number; // cold-touched agents who later booked a first load
  medianDaysToConvert: number | null;
}

export const coldFunnel = (
  agents: AgentLike[],
  contacts: ContactLike[],
  loads: Load[],
): ColdFunnel => {
  let pool = 0;
  let touched = 0;
  let replied = 0;
  let converted = 0;
  const convertDays: number[] = [];
  for (const a of agents) {
    const st = prospectState(a.agent_id, contacts, loads);
    if (st.stage === "converted") {
      if (st.coldTouches > 0) {
        converted++;
        if (st.daysToConvert != null) convertDays.push(st.daysToConvert);
      }
      continue; // working agents aren't in the pool
    }
    pool++;
    if (st.stage === "touched" || st.stage === "replied") touched++;
    if (st.stage === "replied") replied++;
  }
  convertDays.sort((a, b) => a - b);
  const medianDaysToConvert =
    convertDays.length === 0
      ? null
      : convertDays.length % 2
        ? convertDays[(convertDays.length - 1) / 2]
        : (convertDays[convertDays.length / 2 - 1] + convertDays[convertDays.length / 2]) / 2;
  return { pool, touched, replied, converted, medianDaysToConvert };
};
