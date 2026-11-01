import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

// The integrity gauge behind the Trips page: loads + trips must tile the
// odometer, so any span between one record's end and the next record's start
// is miles nobody accounted for. AUDIT ANCHOR (2026-08-09, Jason's call): the
// ledger only audits from the earliest logged trip's odometer — before that
// mark the trip ledger didn't exist, so pre-history isn't nagged about (and
// backfilling an older trip honestly moves the anchor back). No trips = no
// ledger = nothing to audit. Pure; numeric columns arrive as strings from
// Postgres, so everything coerces before math.

// A record with only one of its two readings, sitting inside a gap — almost
// always the gap's explanation (a load delivered without its end odometer).
export interface GapHint {
  kind: "load" | "trip";
  ref: string; // the load number or the trip number
  at: number; // the one reading it has
  missing: "end" | "start";
}

export interface OdometerGap {
  miles: number;
  fromOdo: number; // where the last covered window ended
  toOdo: number; // where the next covered window begins
  fromDate: string | null; // the date the coverage ended (best known)
  toDate: string | null; // the date coverage resumed
  hints: GapHint[]; // half-logged records inside the span, lowest reading first
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
  // The audit anchor — where the trip ledger begins on the odometer.
  let anchor: number | null = null;
  for (const t of trips) {
    const s = num(t.odometer_start);
    if (s != null && (anchor == null || s < anchor)) anchor = s;
  }
  if (anchor == null) return [];

  const wins: Win[] = [];
  const halves: GapHint[] = [];
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
    else if (s != null && e == null) halves.push({ kind: "load", ref: String(l.load_number ?? "?"), at: s, missing: "end" });
    else if (e != null && s == null) halves.push({ kind: "load", ref: String(l.load_number ?? "?"), at: e, missing: "start" });
  }
  for (const t of trips) {
    const s = num(t.odometer_start);
    const e = num(t.odometer_end);
    if (s != null && e != null && e > s)
      wins.push({ s, e, startDate: t.trip_date ?? null, endDate: t.trip_date ?? null });
    else if (s != null && e == null) halves.push({ kind: "trip", ref: String(t.trip_number ?? "?"), at: s, missing: "end" });
    else if (e != null && s == null) halves.push({ kind: "trip", ref: String(t.trip_number ?? "?"), at: e, missing: "start" });
  }
  wins.sort((a, b) => a.s - b.s);
  halves.sort((a, b) => a.at - b.at);

  const gaps: OdometerGap[] = [];
  let maxEnd: number | null = null;
  let maxEndDate: string | null = null;
  for (const w of wins) {
    if (maxEnd != null && maxEnd >= anchor && w.s - maxEnd >= threshold) {
      const from = maxEnd;
      gaps.push({
        miles: w.s - maxEnd,
        fromOdo: maxEnd,
        toOdo: w.s,
        fromDate: maxEndDate,
        toDate: w.startDate,
        hints: halves.filter((h) => h.at >= from && h.at <= w.s),
      });
    }
    if (maxEnd == null || w.e > maxEnd) {
      maxEnd = w.e;
      maxEndDate = w.endDate;
    }
  }
  return gaps;
};
