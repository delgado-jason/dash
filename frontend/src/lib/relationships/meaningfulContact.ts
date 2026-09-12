// Meaningful (two-way) contact — what resets the cooling clock (decision 3):
//   any INBOUND contact;
//   an OUTBOUND call marked 'reached';
//   a load picked up or delivered for that agent.
// Voicemail, no answer, a bad number, and one-way emails / texts do NOT
// count — they count against the weekly cap and nothing else. Pure; PR2's
// cooling flags read this.
import { daysBetweenKeys, keyOf, utcDayKey } from "./dayKeys";

export interface MeaningfulContactLike {
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  method: string;
  outcome?: string | null;
}

export interface MeaningfulLoadLike {
  agent_id?: string | null;
  load_status: string;
  pickup_date?: string | null;
  delivery_date?: string | null;
}

export const isMeaningfulContact = (c: {
  direction: "outbound" | "inbound";
  method: string;
  outcome?: string | null;
}): boolean =>
  c.direction === "inbound" ||
  (c.direction === "outbound" && c.method === "call" && c.outcome === "reached");

// The most recent two-way day for the agent, as 'YYYY-MM-DD'; null when
// there has never been one.
export const lastMeaningfulContact = (
  agentId: string,
  contacts: MeaningfulContactLike[],
  loads: MeaningfulLoadLike[],
): string | null => {
  let max: string | null = null;
  const consider = (raw: string | null | undefined) => {
    if (!raw) return;
    const k = keyOf(raw);
    if (max == null || k > max) max = k;
  };
  for (const c of contacts) {
    if (c.agent_id !== agentId || !isMeaningfulContact(c)) continue;
    consider(c.contacted_at);
  }
  for (const l of loads) {
    if (l.agent_id !== agentId || l.load_status === "cancelled") continue;
    consider(l.pickup_date);
    consider(l.delivery_date);
  }
  return max;
};

// Whole UTC days since the last two-way contact, clamped at 0 — a load booked
// for next week is contact happening NOW, not negative days. null = never.
export const daysSinceMeaningful = (
  agentId: string,
  contacts: MeaningfulContactLike[],
  loads: MeaningfulLoadLike[],
  now: Date,
): number | null => {
  const last = lastMeaningfulContact(agentId, contacts, loads);
  if (last == null) return null;
  return Math.max(0, daysBetweenKeys(last, utcDayKey(now)));
};
