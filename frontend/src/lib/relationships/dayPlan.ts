// The day plan — ADMIN-02 v1.1 §5, one constant. The LOCAL weekday (Brandie's
// calendar, never UTC) picks the plate — the day's one job — and which lists
// feed the rows beneath it:
//   Mon  capacity pass (150 mi from where the truck goes empty) → reactivation
//   Tue  reactivation → reactivation
//   Wed  nurture flags (milestones, holidays) → reactivation
//   Thu  reactivation → reactivation, then prospecting
//   Fri  the five numbers + record hygiene → nothing scheduled below
//   Sat/Sun  no plate — close-outs and callbacks only; Monday's pass previewed
// The fixed "Tier 1 weekly / Tier 2 monthly" due-list is retired: nothing is
// "due" by a clock anymore, only by a reason.

export type PlateKind = "capacity" | "reactivation" | "nurture" | "five" | "none";
export type ListKind = "reactivation" | "prospecting";

export interface DayPlan {
  weekday: number; // Date#getDay — 0 = Sunday
  short: "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
  plate: PlateKind;
  lists: ListKind[]; // the rows under the plate, in order
  weekend: boolean;
}

export const DAY_PLAN: readonly DayPlan[] = [
  { weekday: 0, short: "SUN", plate: "none", lists: [], weekend: true },
  { weekday: 1, short: "MON", plate: "capacity", lists: ["reactivation"], weekend: false },
  { weekday: 2, short: "TUE", plate: "reactivation", lists: ["reactivation"], weekend: false },
  { weekday: 3, short: "WED", plate: "nurture", lists: ["reactivation"], weekend: false },
  { weekday: 4, short: "THU", plate: "reactivation", lists: ["reactivation", "prospecting"], weekend: false },
  { weekday: 5, short: "FRI", plate: "five", lists: [], weekend: false },
  { weekday: 6, short: "SAT", plate: "none", lists: [], weekend: true },
];

export const dayPlan = (now: Date): DayPlan => DAY_PLAN[now.getDay()];

// The plate's job word — the chip beside the day.
export const PLATE_LABEL: Record<PlateKind, string> = {
  capacity: "Capacity pass",
  reactivation: "Reactivation",
  nurture: "Nurture flags",
  five: "The five",
  none: "Weekend",
};
