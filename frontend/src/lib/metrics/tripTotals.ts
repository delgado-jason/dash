import type { Trip } from "@/types/trip";

// The Trips board's year ledger: YTD miles + trip count per purpose, plus the
// current month's miles per purpose and in total. "Current" means the local
// calendar — trip_date is a bare YYYY-MM-DD, so it compares field-wise against
// local now; toISOString would roll the month/year early in the evening, US
// time. Miles = odometer delta when both readings exist and end > start; a
// trip without readings still counts as a trip, contributing 0 mi.

export interface PurposeTotals {
  ytdMi: number;
  ytdTrips: number;
  monthMi: number;
}

export interface TripTotals {
  byPurpose: Partial<Record<Trip["trip_purpose"], PurposeTotals>>;
  monthMi: number;
}

export const EMPTY_PURPOSE: PurposeTotals = { ytdMi: 0, ytdTrips: 0, monthMi: 0 };

const mi = (t: Trip): number => {
  const s = Number(t.odometer_start);
  const e = Number(t.odometer_end);
  return t.odometer_start != null && t.odometer_end != null && Number.isFinite(s) && Number.isFinite(e) && e > s
    ? e - s
    : 0;
};

export const tripTotals = (trips: Trip[], now: Date = new Date()): TripTotals => {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const byPurpose: TripTotals["byPurpose"] = {};
  let monthMi = 0;
  for (const t of trips) {
    const d = t.trip_date;
    if (!d || Number(d.slice(0, 4)) !== year) continue;
    const bucket = (byPurpose[t.trip_purpose] ??= { ytdMi: 0, ytdTrips: 0, monthMi: 0 });
    const miles = mi(t);
    bucket.ytdTrips += 1;
    bucket.ytdMi += miles;
    if (Number(d.slice(5, 7)) === month) {
      bucket.monthMi += miles;
      monthMi += miles;
    }
  }
  return { byPurpose, monthMi };
};
