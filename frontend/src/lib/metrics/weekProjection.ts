import type { Load } from "@/types/load";
import { loadRevenue } from "./loads";

// How the pay week actually finishes — each load counted exactly ONCE, by
// where its delivery lands inside the pay week [weekStart, weekStart + 7d).
// The old projection added weekEarned + weekBooked, which double-counted a
// load that had already delivered but still sat in the booked bucket (Jason
// caught a $16.8k "record week" that wasn't real, 2026-08-09).
//
//   earned    — delivered inside the window
//   incoming  — in transit or booked, DELIVERING inside the window
//   projected — earned + incoming
//
// A booked load with no delivery date can't be windowed and is excluded —
// it may well land next week, and a projection must not invent timing.
export interface WeekProjection {
  earned: number;
  incoming: number;
  incomingCount: number;
  projected: number;
}

const MS_PER_DAY = 86_400_000;

export const projectWeek = (
  loads: Load[],
  weekStart: Date,
): WeekProjection => {
  const start = Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate(),
  );
  const end = start + 7 * MS_PER_DAY;

  let earned = 0;
  let incoming = 0;
  let incomingCount = 0;
  for (const l of loads) {
    if (l.load_status === "cancelled" || l.load_status === "tonu") continue;
    if (!l.delivery_date) continue;
    const t = new Date(String(l.delivery_date).slice(0, 10) + "T00:00:00Z").getTime();
    if (t < start || t >= end) continue;
    if (l.load_status === "delivered") {
      earned += loadRevenue(l);
    } else {
      incoming += loadRevenue(l);
      incomingCount += 1;
    }
  }
  return { earned, incoming, incomingCount, projected: earned + incoming };
};
