// On-time and detention logic, derived from a load's scheduled appointment/window
// vs its actual in/out times. Free-time is a per-user setting (hours). Pure — the
// UI passes the load + freeHours in.
import type { Load } from "@/types/load";
import { fmtDuration } from "./stopTimes";

export type OnTime = "on-time" | "late" | "waited";

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// On-time from the scheduled appt/window vs actual arrival. null = can't tell
// (no appointment set, or no arrival recorded).
// - Set appointment (no end): on-time if you arrived at/before start, else late.
// - Window [start, end]: on-time inside it, "waited" if you beat it, late if after.
export const onTimeStatus = (
  apptStart?: string | null,
  apptEnd?: string | null,
  arrival?: string | null,
): OnTime | null => {
  if (!apptStart || !arrival) return null;
  const a = toMin(arrival);
  const start = toMin(apptStart);
  if (!apptEnd) return a <= start ? "on-time" : "late";
  const end = toMin(apptEnd);
  if (a < start) return "waited";
  if (a > end) return "late";
  return "on-time";
};

// Billable detention minutes at ONE stop = time released past the free window.
// The free clock starts at the SCHEDULED appointment — the window's END if it's a
// window, else the set appointment time — NOT at arrival, so showing up early
// never earns detention. Falls back to arrival only when no appointment is
// recorded. Needs the out (release) time; 0 without it.
export const stopDetentionMinutes = (
  inT: string | null | undefined,
  outT: string | null | undefined,
  apptStart: string | null | undefined,
  apptEnd: string | null | undefined,
  freeHours: number,
): number => {
  if (!outT) return 0;
  const clock = apptEnd ?? apptStart ?? inT; // window end → appt → arrival
  if (!clock) return 0;
  const inMin = inT ? toMin(inT) : null;
  let out = toMin(outT);
  const start = toMin(clock);
  // Overnight only when the stop actually crossed midnight — the release reads
  // earlier than the ARRIVAL. Anchoring on the arrival (not the appointment) is
  // the fix: a truck released before the free window even closes is just an
  // early/on-time departure (zero detention), NOT a midnight crossing.
  if (inMin != null && out < inMin) out += 1440;
  return Math.max(0, out - (start + freeHours * 60));
};

// Total billable-eligible detention across both stops (shipper + receiver).
export const detentionMinutes = (load: Load, freeHours: number): number =>
  stopDetentionMinutes(
    load.shipper_in,
    load.shipper_out,
    load.pickup_appt_start,
    load.pickup_appt_end,
    freeHours,
  ) +
  stopDetentionMinutes(
    load.receiver_in,
    load.receiver_out,
    load.delivery_appt_start,
    load.delivery_appt_end,
    freeHours,
  );

// "2h 20m" of detention time, or null when none.
export const detentionLabel = (load: Load, freeHours: number): string | null =>
  fmtDuration(detentionMinutes(load, freeHours));

// ---- The three detention states (billable is Jason's call, not auto) ----

// Past the free window AND still undecided (billable null) and not paid → the
// app nudges Jason to ask the agent. A candidate, not a claim.
export const detentionEligible = (load: Load, freeHours: number): boolean =>
  load.detention_billable == null &&
  !load.detention_paid &&
  detentionMinutes(load, freeHours) > 0;

// Confirmed with the agent (billable = true) and not yet collected → the amber
// flag/banner. No longer auto-derived from a long dwell — it's a decision.
export const detentionOwed = (load: Load): boolean =>
  load.detention_billable === true && !load.detention_paid;

// Confirmed and collected.
export const detentionCollected = (load: Load): boolean =>
  load.detention_billable === true && !!load.detention_paid;

// Detention time that was actually confirmed + collected (for "collected" stats).
export const detentionCollectedMinutes = (
  load: Load,
  freeHours: number,
): number => (detentionCollected(load) ? detentionMinutes(load, freeHours) : 0);

// A TONU load's fee is owed until marked paid → the red flag/banner.
export const tonuOwed = (load: Load): boolean =>
  load.load_status === "tonu" && !load.tonu_paid;

// The loads-table flag, in priority order: unpaid TONU (red) beats confirmed
// detention (amber) beats a detention candidate (faint nudge) beats an
// in-transit load (green). null = none.
export type LoadFlag =
  "tonu" | "detention" | "detention-eligible" | "in-transit";

export const loadFlag = (load: Load, freeHours: number): LoadFlag | null => {
  if (tonuOwed(load)) return "tonu";
  if (detentionOwed(load)) return "detention";
  if (detentionEligible(load, freeHours)) return "detention-eligible";
  if (load.load_status === "in_transit") return "in-transit";
  return null;
};
