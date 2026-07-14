// On-time and detention logic, derived from a load's scheduled appointment/window
// vs its actual in/out times. Free-time is a per-user setting (hours), applied per
// stop. Pure — the UI passes the load + freeHours in.
import type { Load } from "@/types/load";
import { dwellMinutes, fmtDuration } from "./stopTimes";

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

// Billable detention minutes at one stop — dwell beyond the free window.
export const stopDetentionMinutes = (
  inT: string | null | undefined,
  outT: string | null | undefined,
  freeHours: number,
): number => {
  const d = dwellMinutes(inT, outT);
  if (d == null) return 0;
  return Math.max(0, d - freeHours * 60);
};

// Total billable detention across both stops.
export const detentionMinutes = (load: Load, freeHours: number): number =>
  stopDetentionMinutes(load.shipper_in, load.shipper_out, freeHours) +
  stopDetentionMinutes(load.receiver_in, load.receiver_out, freeHours);

// "2h 20m" of billable detention, or null when none.
export const detentionLabel = (load: Load, freeHours: number): string | null =>
  fmtDuration(detentionMinutes(load, freeHours));

// Detention is owed (and not yet collected) → the amber flag/banner.
export const detentionOwed = (load: Load, freeHours: number): boolean =>
  !load.detention_paid && detentionMinutes(load, freeHours) > 0;

// A TONU load's fee is owed until marked paid → the red flag/banner.
export const tonuOwed = (load: Load): boolean =>
  load.load_status === "tonu" && !load.tonu_paid;

// The loads-table traffic-light flag, in priority order: an unpaid TONU (red)
// beats unpaid detention (amber) beats an in-transit load (green). null = none.
export type LoadFlag = "tonu" | "detention" | "in-transit";

export const loadFlag = (load: Load, freeHours: number): LoadFlag | null => {
  if (tonuOwed(load)) return "tonu";
  if (detentionOwed(load, freeHours)) return "detention";
  if (load.load_status === "in_transit") return "in-transit";
  return null;
};
