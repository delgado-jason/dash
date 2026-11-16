// Inbound share — who called whom. `booked_via` is a fact on every load
// (the agent reached out, or you did), and this module is the one definition
// of the fraction at every altitude: fleet-wide, per agency, per agent. It
// stood in lib/metrics/relationships.ts until the Relationships feature was
// retired (the retirement sheet, call 8); the agencies pages read it as a
// fact and keep doing so.
import type { Load } from "@/types/load";
import { keyOf } from "@/lib/dates/dayKeys";
import { isNeverRevenue } from "./status";

// The day the contact log went live — the inbound gauge's baseline.
export const SYSTEM_START = "2026-09-03";

export interface InboundShare {
  attributed: number; // loads carrying a booked_via
  inbound: number;
  share: number | null; // inbound ÷ attributed; null when nothing attributed
}

// Exported so every caller counts the same way — one definition of
// "attributed", one of the fraction, here.
export const shareOf = (loads: Load[]): InboundShare => {
  const attributed = loads.filter((l) => l.booked_via != null);
  const inbound = attributed.filter((l) => l.booked_via === "agent_reached_out").length;
  return {
    attributed: attributed.length,
    inbound,
    share: attributed.length > 0 ? inbound / attributed.length : null,
  };
};

// The loads a share may be taken over: non-cancelled, and BOOKED inside
// [fromKey, toKey]. The booking day is `created_at`'s UTC day key — the day
// the load was written into dash, the same convention SYSTEM_START is a key
// in — and never the pickup: the agent reached out when the load was BOOKED,
// so a Monday booking for Thursday's pickup counts on Monday, not three days
// later when the truck rolls. Legacy loads carry no booked_via and fall out of
// every denominator inside shareOf, not here.
export const bookedInWindow = (
  loads: Load[],
  fromKey: string,
  toKey: string,
): Load[] =>
  loads.filter((l) => {
    if (isNeverRevenue(l) || !l.created_at) return false;
    const booked = keyOf(l.created_at);
    return booked >= fromKey && booked <= toKey;
  });

// The system's one number, at every altitude: fleet-wide, per tier, per
// agent. Non-cancelled loads BOOKED in [fromKey, toKey]; legacy nulls out.
export const inboundShare = (
  loads: Load[],
  fromKey: string,
  toKey: string,
): InboundShare => shareOf(bookedInWindow(loads, fromKey, toKey));

