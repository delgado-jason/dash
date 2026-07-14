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

// Minutes a load sat at a stop (out − in), rolling a day when it ran overnight.
// Null unless both times are present.
export const dwellMinutes = (
  inT?: string | null,
  outT?: string | null,
): number | null => {
  if (!inT || !outT) return null;
  let d = toMin(outT) - toMin(inT);
  if (d < 0) d += 1440; // ran past midnight
  return d;
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
