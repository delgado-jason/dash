import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

// The integrity gauge behind the Trips page: loads + trips must tile the
// odometer, so any span between one record's end and the next record's start
// is miles nobody accounted for. Pure; numeric columns arrive as strings from
// Postgres, so everything coerces before math.

export interface OdometerGap {
  miles: number;
  fromOdo: number; // where the last covered window ended
  toOdo: number; // where the next covered window begins
  fromDate: string | null; // the date the coverage ended (best known)
  toDate: string | null; // the date coverage resumed
}

// Small spans are parking-lot noise (yard moves, rounding between readings);
// only real holes surface.
export const GAP_THRESHOLD_MI = 25;

interface Win {
  s: number;
  e: number;
  endDate: string | null;
  startDate: string | null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const odometerGaps = (
  loads: Load[],
  trips: Trip[],
  threshold: number = GAP_THRESHOLD_MI,
): OdometerGap[] => {
  const wins: Win[] = [];
  for (const l of loads) {
    const s = num(l.odometer_start);
    const e = num(l.odometer_end);
    if (s != null && e != null && e > s)
      wins.push({
        s,
        e,
        startDate: l.pickup_date ?? null,
        endDate: l.delivery_date ?? l.pickup_date ?? null,
      });
  }
  for (const t of trips) {
    const s = num(t.odometer_start);
    const e = num(t.odometer_end);
    if (s != null && e != null && e > s)
      wins.push({ s, e, startDate: t.trip_date ?? null, endDate: t.trip_date ?? null });
  }
  wins.sort((a, b) => a.s - b.s);

  const gaps: OdometerGap[] = [];
  let maxEnd: number | null = null;
  let maxEndDate: string | null = null;
  for (const w of wins) {
    if (maxEnd != null && w.s - maxEnd >= threshold) {
      gaps.push({
        miles: w.s - maxEnd,
        fromOdo: maxEnd,
        toOdo: w.s,
        fromDate: maxEndDate,
        toDate: w.startDate,
      });
    }
    if (maxEnd == null || w.e > maxEnd) {
      maxEnd = w.e;
      maxEndDate = w.endDate;
    }
  }
  return gaps;
};
