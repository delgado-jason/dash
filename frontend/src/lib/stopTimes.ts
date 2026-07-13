// Formatting + duration for a load's stop times. Times are bare "HH:MM[:SS]"
// (Postgres `time`) — no date, no timezone, so no day-shift risk.

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
// Null unless both times are present (or the gap is zero). → "2h 15m".
export const dwell = (
  inT?: string | null,
  outT?: string | null,
): string | null => {
  if (!inT || !outT) return null;
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let d = mins(outT) - mins(inT);
  if (d < 0) d += 1440; // ran past midnight
  if (d === 0) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
