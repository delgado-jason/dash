// On-time and detention logic, derived from a load's scheduled appointment/window
// vs its actual in/out times. Free-time is a per-user setting (hours). Pure — the
// UI passes the load + freeHours in.
import type { Load } from "@/types/load";
import { fmtDuration, stopAnchorMin } from "./stopTimes";

// The fallback ONLY for when no settlement schedule exists (or while it is
// still loading). The live number is settlement_schedules.detention_free_hours,
// edited on Settings (GL-150) — every page reads it from the schedule and
// passes it in; nothing computes detention against a bare 3.
export const DEFAULT_DETENTION_FREE_HOURS = 3;

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

// ---- WHETHER a claim is possible at all (Jason's rule, 2026-11-10) ----
//
// "A late arrival or missing an appointment time means I will not be able to
// claim detention."
//
// So claimability is a gate, not a calculation: no appointment, no claim; late,
// no claim. Early still claims — you were there and waiting. That is exactly
// `onTimeStatus` being non-null and not "late", so the two definitions are one
// function and cannot drift.
//
// The gate replaces the old `?? inT` fallback, which counted a no-appointment
// stop's free time from arrival, and it adds the lateness test that was never
// there. Both erred toward showing detention that could not be collected —
// the worst direction for a number you take to an agent. On 2026-11-10 prod
// held 55 stops with an arrival and a release, all 55 with an appointment and
// none of them late, so no stored figure moves; what moves is what the code
// will do the first time either case appears. One already waits in the data:
// load 2194005's receiver, in at 09:44 against an 08:00 appointment, with no
// out-time yet.
// "no-arrival" is the same rule read from the other side: with no in-time there
// is no way to know whether the truck was late, so there is nothing to claim.
// The app already says this in Brandie's OWED band — "detention cannot be
// counted on this load until it is" — and no stop in prod has a release without
// an arrival, so writing it down changes no figure.
export type NoClaim = "late" | "no-appointment" | "no-arrival";

export const detentionBar = (
  apptStart: string | null | undefined,
  apptEnd: string | null | undefined,
  arrival: string | null | undefined,
): NoClaim | null => {
  if (!apptStart) return "no-appointment";
  if (!arrival) return "no-arrival";
  if (onTimeStatus(apptStart, apptEnd, arrival) === "late") return "late";
  return null;
};

// What to say on screen when a claim is barred. The reason is the useful part:
// "no appointment" is fixable by setting one, "late" is not.
export const NO_CLAIM_WORDS: Record<NoClaim, string> = {
  late: "arrived late — not claimable",
  "no-appointment": "no appointment set — not claimable",
  "no-arrival": "no in-time logged — not claimable",
};

// Billable detention minutes at ONE stop: the time held past the free window,
// measured from the SAME anchor as dwell (`stopAnchorMin` — the later of the
// arrival and the appointment's START). Needs the out (release) time; 0 without
// it. Gated by `detentionBar` above: a late arrival, or a stop with no
// appointment, claims nothing however long the truck actually sat.
//
// The appointment's END does not anchor this clock — it only decides lateness.
// It used to anchor it, and on a wide window that made detention mathematically
// unclaimable: load 1045087's shipper ran a 07:00–23:45 "window", held the
// truck from 11:10 to 20:15, and scored ZERO because free time was counted from
// 23:45. Under the anchor it is 6h05m, which is what actually happened.
export const stopDetentionMinutes = (
  inT: string | null | undefined,
  outT: string | null | undefined,
  apptStart: string | null | undefined,
  apptEnd: string | null | undefined,
  freeHours: number,
): number => {
  if (!outT) return 0;
  if (detentionBar(apptStart, apptEnd, inT)) return 0;
  // The bar guarantees both an appointment and an arrival by here.
  const anchor = stopAnchorMin(inT, apptStart);
  if (anchor == null) return 0;
  const inMin = toMin(String(inT));
  let out = toMin(outT);
  // Overnight only when the stop actually crossed midnight — the release reads
  // earlier than the ARRIVAL. Judging the wrap on the arrival (not the
  // appointment) is the fix: a truck released before the free window even
  // closes is an early/on-time departure (zero detention), NOT a crossing.
  if (out < inMin) out += 1440;
  return Math.max(0, out - (anchor + freeHours * 60));
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
