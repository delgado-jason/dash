// Formatting + duration for a load's stop times. Times are bare "HH:MM[:SS]"
// (Postgres `time`) — no date, no timezone, so no day-shift risk.

// Minutes-of-day for an "HH:MM[:SS]" time.
const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// "08:30:00" → "8:30a". Returns "—" for a missing time.
export const fmtTime = (t?: string | null): string => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  let hr = Number(h);
  const ampm = hr >= 12 ? "p" : "a";
  hr = hr % 12 || 12;
  return `${hr}:${m}${ampm}`;
};

// ---- THE ANCHOR: when the clock starts (Jason's rule, 2026-11-10) ----
//
// "I can't penalize facilities for arriving early with high dwell times. The
// dwell time starts just like how my detention time would start."
//
// So the clock starts at the LATER of the arrival and the appointment's start:
//
//   Hard appointment 09:00, rolled in at 06:00 → starts 09:00. The three hours
//   spent waiting for the dock to open were his choice, not the facility's.
//   Window 08:00–12:00, backed in at 09:30  → starts 09:30. Inside the window,
//   so the clock starts on arrival — which is the window's whole meaning.
//   Window 08:00–12:00, backed in at 07:00  → starts 08:00. Early again.
//   No appointment at all                    → starts on arrival; there is
//   nothing else to measure against.
//
// The APPOINTMENT'S END never anchors the clock. It only decides lateness (see
// `detentionBar`): missing a window is being late, the same as blowing past a
// hard appointment time.
//
// One anchor for both numbers is the point. Dwell is what the facility cost
// him; detention is the claimable part of that. They cannot start at different
// moments and still describe the same stop.
export const stopAnchorMin = (
  inT: string | null | undefined,
  apptStart: string | null | undefined,
): number | null => {
  if (!inT) return null;
  const a = toMin(inT);
  return apptStart ? Math.max(a, toMin(apptStart)) : a;
};

// Minutes a load sat at a stop, from the anchor above to the release, rolling a
// day when it ran overnight. Null unless both times are present.
//
// Clamped at 0, which is a real case and not a paranoia guard: load 6913105's
// receiver had a 12:00 appointment, took the truck at 09:47 and released it at
// 10:12 — out before the appointment even came round. The facility held him for
// no time at all, and a negative dwell would have scored them as if they had
// handed time back.
export const dwellMinutes = (
  inT?: string | null,
  outT?: string | null,
  apptStart?: string | null,
): number | null => {
  if (!inT || !outT) return null;
  const inM = toMin(inT);
  let outM = toMin(outT);
  if (outM < inM) outM += 1440; // ran past midnight — judged against the ARRIVAL
  const anchor = stopAnchorMin(inT, apptStart);
  return Math.max(0, outM - (anchor ?? inM));
};

// A minute count → "2h 15m" / "45m" / "3h". Null (nothing to show) for ≤ 0.
export const fmtDuration = (mins: number | null): string | null => {
  if (mins == null || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

// Formatted dwell for a stop → "2h 15m" (null when incomplete or zero-length).
export const dwell = (inT?: string | null, outT?: string | null): string | null =>
  fmtDuration(dwellMinutes(inT, outT));
