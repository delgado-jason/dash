import { dayKey } from "@/lib/perDiem";

// Hometime = days since your most recent "home" mark on the per-diem calendar.
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
