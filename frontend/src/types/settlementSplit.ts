// The pay split with the day it starts (Q10, Jason 2026-11-05: "Date the
// schedule rows"; General Items Nod Sheet mock 6, call 6 lean A, nodded
// 2026-11-07: edit the current row in place, a new row starts a new date).
// A load settles on the split in force on its delivery day — the latest
// effective_from on or before it (NET-01). The undated settings that are not
// a split (settlement day, detention hours, the hometime threshold, the rate
// tiers, the margin goal) stay on SettlementSchedule. Fractions, not percents:
// 0.65 = 65%. Day keys ("YYYY-MM-DD"), never Dates.
export interface SettlementSplit {
  split_id: string;
  effective_from: string; // "YYYY-MM-DD" — the first day this split applies
  linehaul_pct: number;
  trailer_pct: number;
  fuel_surcharge_pct: number;
  accessorial_pct: number; // the fallback for an accessorial type with no pay rate
  note: string | null; // "the trailer's share began with the trailer"
}

// The write shape — what the Settings table sends. Editing the current row in
// place sends a Partial; starting a new schedule sends every field.
export interface SettlementSplitInput {
  effective_from: string;
  linehaul_pct: number;
  trailer_pct: number;
  fuel_surcharge_pct: number;
  accessorial_pct: number;
  note?: string | null;
}

// What the cost basis needs of a split: the linehaul take. Structural, so the
// synthetic book and a Settings row both qualify.
export type SplitLike = Pick<SettlementSplit, "linehaul_pct" | "trailer_pct">;
