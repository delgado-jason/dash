// A per-diem rate with the day it starts (GL-136, 2026-11-05: "Dated rates";
// General Items Nod Sheet mock 1, call 1 lean A). One row per start date; the
// rate in force on a day is the row with the latest effective_from on or
// before it. A day before the first row has NO rate — it is refused, never
// priced at 0 or at a guessed rate. Dates are day keys ("YYYY-MM-DD"), never
// Date objects, so no timezone can shift a start by a day.
export interface PerDiemRate {
  rate_id: string;
  effective_from: string; // "YYYY-MM-DD" — the first day this rate applies
  rate: number; // dollars per full day (a half day is 75% of it)
  note: string | null; // where the number came from — "IRS FY2026 transportation rate"
}

// The write shape — what the Settings table sends. `note` may be left out.
export interface PerDiemRateInput {
  effective_from: string;
  rate: number;
  note?: string | null;
}
