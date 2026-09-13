// The agent-relationship brain (Jason, 2026-09-03; approved mockups).
// Doctrine: tiers are the OWNER'S call; every lifecycle state is DERIVED
// (an agent with zero loads IS a prospect); last-contacted is always MAX over
// the contact log; attribution lives on the load and legacy nulls sit outside
// every denominator. Pure + clock-injected throughout.
import type { Load } from "@/types/load";
import type { ContactType } from "@/lib/relationships/contactTypes";
import { localDayKey } from "@/lib/relationships/dayKeys";

// The day the relationship system went live — the inbound gauge's baseline.
export const SYSTEM_START = "2026-09-03";

const DAY = 86_400_000;

// `n` local calendar days before `d` — built from the local y/m/d so a DST
// hour can't shift the day, the way subtracting milliseconds could.
const localDaysAgo = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);

export interface ContactLike {
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  method: "call" | "email" | "text";
  type: ContactType;
  load_id?: string | null;
}

export interface AgentLike {
  agent_id: string;
  first_name: string;
  last_name: string;
  // 1 | 2 | 3, or null = no owner-set tier (v2: a Prospect / dormant-Parked).
  // Untiered agents fold into the Tier 3 bar in inboundByTier — the old long
  // tail — until PR4's Review re-cuts it on v2's buckets.
  relationship_tier: number | null;
  // 'parked' agents leave every WORKING surface (Today, the call lists). They
  // stay in ANALYTICAL ones — a parked agent's revenue and rate still
  // happened. Absent/undefined reads as active.
  work_status?: "active" | "parked";
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
}

// The v1 cadence queue (Tier 1 weekly, Tier 2 monthly, cold follow-ups) and
// the Tuesday / Friday pickers were retired with REL-01 v2.0: nothing is
// "due" by a clock anymore, only by a reason — lib/relationships/todayQueue.

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

// Delivered loads (trailing `days`) with NO close-out contact linked yet —
// Today's NOW rows read this with days = 14. The window is `days` LOCAL
// calendar days ending today: delivery_date is a DATE column (a calendar
// day), so it compares cleanly against the local key — and Today's "today"
// is Brandie's, which after ~7pm Central is not UTC's.
export const closeOutPending = (
  loads: Load[],
  contacts: ContactLike[],
  now: Date,
  days = 7,
): Load[] => {
  const start = localDayKey(localDaysAgo(now, days - 1));
  const end = localDayKey(now);
  const closed = new Set(
    contacts.filter((c) => c.type === "close_out" && c.load_id).map((c) => c.load_id),
  );
  return loads.filter(
    (l) =>
      l.load_status === "delivered" &&
      l.delivery_date &&
      l.delivery_date.slice(0, 10) >= start &&
      l.delivery_date.slice(0, 10) <= end &&
      !closed.has(l.load_id),
  );
};

export interface InboundShare {
  attributed: number; // loads carrying a booked_via
  inbound: number;
  share: number | null; // inbound ÷ attributed; null when nothing attributed
}

// Exported: lib/relationships/review re-cuts the very same numbers by v2
// bucket and must count them identically — one definition of "attributed",
// one of the fraction, here.
export const shareOf = (loads: Load[]): InboundShare => {
  const attributed = loads.filter((l) => l.booked_via != null);
  const inbound = attributed.filter((l) => l.booked_via === "agent_reached_out").length;
  return {
    attributed: attributed.length,
    inbound,
    share: attributed.length > 0 ? inbound / attributed.length : null,
  };
};

// The loads a share may be taken over: booked (non-cancelled) and picked up
// inside [fromKey, toKey]. Legacy loads carry no booked_via and fall out of
// every denominator inside shareOf, not here.
export const bookedInWindow = (
  loads: Load[],
  fromKey: string,
  toKey: string,
): Load[] =>
  loads.filter(
    (l) =>
      l.load_status !== "cancelled" &&
      !!l.pickup_date &&
      l.pickup_date.slice(0, 10) >= fromKey &&
      l.pickup_date.slice(0, 10) <= toKey,
  );

// The system's one number, at every altitude: fleet-wide, per tier, per
// agent. Booked (non-cancelled) loads in [fromKey, toKey]; legacy nulls out.
export const inboundShare = (
  loads: Load[],
  fromKey: string,
  toKey: string,
): InboundShare => shareOf(bookedInWindow(loads, fromKey, toKey));

export const inboundByTier = (
  agents: AgentLike[],
  loads: Load[],
  fromKey: string,
  toKey: string,
): Record<number, InboundShare> => {
  // Untiered (v2 Prospects) fold into the Tier 3 bar — the old long tail.
  const tierOf = new Map(agents.map((a) => [a.agent_id, a.relationship_tier ?? 3]));
  const windowed = bookedInWindow(loads, fromKey, toKey);
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
