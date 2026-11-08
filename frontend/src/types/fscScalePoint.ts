// One week of Landstar's fuel-surcharge scale, as the weekly Ranger report
// publishes it ("General Items" Nod Sheet mock 8, call 8 lean A, nodded
// 2026-11-08): the national-average diesel price and the cents per loaded
// mile it pays, the % of linehaul when the line carries it, and the regional
// PADD points as optional extras. Each (price, cpm) pair is a point the scale
// fit reads — see lib/metrics/fscScale.ts. Day keys ("YYYY-MM-DD"), never Dates.
export interface FscRegionPoint {
  region: string; // "PADD 1A" · "PADD 4" · "PADD 5"
  price: number; // $/gal
  cpm: number; // $ per loaded mile
}

export interface FscScalePoint {
  point_id: string;
  week_of: string; // the report's first effective day, "YYYY-MM-DD"
  national_avg: number; // $/gal
  cents_per_mile: number; // $ per loaded mile (0.86 = 86¢)
  pct_of_linehaul: number | null; // 0.52 when the report gave it
  regions: FscRegionPoint[];
  note: string | null;
}

export interface FscScalePointInput {
  week_of: string;
  national_avg: number;
  cents_per_mile: number;
  pct_of_linehaul?: number | null;
  regions?: FscRegionPoint[];
  note?: string | null;
}
