import { dayKey } from "@/lib/perDiem";

// Hometime = days since your most recent "home" mark on the per-diem calendar
// OR your latest home-purpose trip, whichever says you were home (lastHomeSignal).
//   none → no home marks yet (show a nudge, never a false alarm)
//   home → home today (daysOut 0)
//   ok   → out, but within your threshold
//   over → out past your threshold (flag it)
export type HometimeState = "none" | "home" | "ok" | "over";

export interface Hometime {
  state: HometimeState;
  daysOut: number | null; // days since last home; null when no marks
  toTarget: number | null; // days left before the threshold (>=0); null unless ok/home
  lastHome: string | null; // "YYYY-MM-DD"
  threshold: number;
}

// Whole calendar days between two "YYYY-MM-DD" dates, both anchored at UTC
// midnight so the difference is timezone-proof (no DST drift).
const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

// The days a trip says you were home: purpose "home", not cancelled
// ("YYYY-MM-DD" of its trip_date). Nod Sheet 2026-11-05, GL-141: a home-purpose
// trip resets the counter the same as a per-diem home mark.
export const homeTripDays = (
  trips: ReadonlyArray<{ trip_purpose: string; trip_date: string | null; status?: string | null }>,
): string[] =>
  trips
    .filter((t) => t.trip_purpose === "home" && t.status !== "cancelled" && !!t.trip_date)
    .map((t) => String(t.trip_date).slice(0, 10));

// The day the counter resets on: the LATEST of the last home mark (what
// lastHomeDay found) and any home-purpose trip day that has already happened.
// A trip dated in the future is planned time at home, not time spent at home.
// The per-diem deduction never reads this — it still reads marks alone.
export const lastHomeSignal = (
  lastMarkHome: string | null,
  tripDays: string[],
  today: Date,
): string | null => {
  const todayKey = dayKey(today);
  let best = lastMarkHome;
  for (const d of tripDays) {
    if (d <= todayKey && (best == null || d > best)) best = d;
  }
  return best;
};

export const hometimeStatus = (
  lastHome: string | null,
  threshold: number,
  today: Date,
): Hometime => {
  if (!lastHome)
    return {
      state: "none",
      daysOut: null,
      toTarget: null,
      lastHome: null,
      threshold,
    };

  // A future home mark (planned home time) shouldn't read as "negative days out".
  const daysOut = Math.max(0, daysBetween(lastHome, dayKey(today)));

  if (daysOut === 0)
    return { state: "home", daysOut: 0, toTarget: threshold, lastHome, threshold };
  if (daysOut > threshold)
    return { state: "over", daysOut, toTarget: null, lastHome, threshold };
  return { state: "ok", daysOut, toTarget: threshold - daysOut, lastHome, threshold };
};
