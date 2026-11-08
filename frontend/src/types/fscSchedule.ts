// Landstar's fuel-surcharge band table (GL-155, Jason 2026-11-05: "it's a
// price-band table" that changes often with no API; General Items Nod Sheet
// mock 5, call 5 lean A, nodded 2026-11-07: keep every pasted table with its
// effective date). The table in force on a day is the row with the latest
// effective_from on or before it. Day keys ("YYYY-MM-DD"), never Dates.
export interface FscBand {
  low: number; // national-average diesel, $/gal, inclusive
  high: number | null; // inclusive upper bound; null = "and up" (only the last band)
  cpm: number; // the surcharge, $ per LOADED mile (0.58 = 58¢)
}

export interface FscSchedule {
  schedule_id: string;
  effective_from: string; // "YYYY-MM-DD" — the first day this table applies
  bands: FscBand[]; // ascending by low
  note: string | null; // where it came from — "Landstar BCO FSC schedule, Oct 2026"
  created_at: string; // when it was pasted
}

export interface FscScheduleInput {
  effective_from: string;
  bands: FscBand[];
  note?: string | null;
}
