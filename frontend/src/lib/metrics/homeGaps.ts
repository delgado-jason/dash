// Stretches that look like home time but were never marked.
//
// WHY THIS EXISTS. Home days only began being marked in July 2026, so every
// month before that reads as if the truck was available every single day. That
// makes utilization flatter than it was: miles per day out came out at 283
// when the real figure, once the unmarked home weeks are allowed for, is 322.
// Every month-over-month comparison that crosses July is reading two different
// definitions of "a working day".
//
// WHAT IT WILL NOT DO IS GUESS IN WRITING. Four of those gaps have no trip
// logged at all — the only evidence is that each ends with a pickup within
// ninety miles of home. That is enough to RAISE the question and nowhere near
// enough to answer it: a week could just as easily have been a breakdown, a
// slow market, or a load that fell through. So this finds the candidates,
// shows the evidence it has, and waits. Marking is a click, never a migration.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { isDelivered } from "./status";

export interface HomeGap {
  /** The delivery that ended the last run. */
  from: string;
  /** The pickup that started the next one. */
  to: string;
  /** Whole days between them — the candidate days. */
  days: number;
  /** Where the truck was left. */
  droppedAt: string | null;
  /** Where it loaded next. */
  nextPickup: string | null;
  /**
   * A `home` trip inside the gap. This is the strong evidence — the trip log
   * says he drove home — and it is what separates a near-certainty from a
   * guess, so the UI leads with it.
   */
  homeTrip: boolean;
  /** Days in the gap already marked home: a partly-marked stretch. */
  alreadyMarked: number;
  /** The unmarked days, which is what a click would write. */
  unmarked: string[];
}

const DAY_MS = 86_400_000;
const day = (v: unknown): string => String(v ?? "").slice(0, 10);
const addDays = (key: string, n: number): string =>
  new Date(new Date(`${key}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const between = (a: string, b: string): number =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS);

const place = (city: unknown, state: unknown): string | null => {
  const c = String(city ?? "").trim();
  const s = String(state ?? "").trim();
  if (!c && !s) return null;
  return [c, s].filter(Boolean).join(", ");
};

/**
 * Gaps of at least `minDays` between one delivery and the next pickup, with
 * whatever evidence exists that the truck was at home.
 *
 * The days offered are the ones BETWEEN the two dates, exclusive: the delivery
 * day and the pickup day were both worked, and marking either would be wrong.
 */
/**
 * Longer than this and a gap stops being a home stretch and starts being a
 * hole in the records. Jason's longest real one is twenty days; a seventy-day
 * silence means loads were never entered, and offering to mark it as home time
 * would write seventy wrong days on one click. Those belong to a records
 * problem, not this panel.
 */
export const MAX_PLAUSIBLE_GAP = 21;

/** Enough to act on. A wall of candidates is ignored, not answered. */
export const MAX_CANDIDATES = 10;

export const homeGapCandidates = (
  loads: readonly Load[],
  trips: readonly Trip[],
  homeDays: readonly string[],
  minDays = 3,
  maxDays = MAX_PLAUSIBLE_GAP,
): HomeGap[] => {
  const runs = loads
    .filter((l) => isDelivered(l) && l.delivery_date && l.pickup_date)
    .map((l) => ({
      pickup: day(l.pickup_date),
      delivery: day(l.delivery_date),
      city: place(l.destination_city, l.destination_state),
      fromCity: place(l.origin_city, l.origin_state),
    }))
    .sort((a, b) => (a.delivery < b.delivery ? -1 : a.delivery > b.delivery ? 1 : 0));

  const marked = new Set(homeDays.map(day));
  const homeTrips = new Set(
    trips.filter((t) => t.trip_purpose === "home" && t.trip_date).map((t) => day(t.trip_date)),
  );

  const out: HomeGap[] = [];
  for (let i = 0; i < runs.length - 1; i++) {
    const a = runs[i];
    const b = runs[i + 1];
    // The next run can START before this one delivered (a relay, a reload on
    // the way). That is not a gap at all, and a negative span must never be
    // offered as home time.
    const span = between(a.delivery, b.pickup);
    if (span < minDays || span > maxDays) continue;

    const days: string[] = [];
    for (let d = 1; d < span; d++) days.push(addDays(a.delivery, d));
    if (days.length === 0) continue;

    const unmarked = days.filter((d) => !marked.has(d));
    // Nothing to offer on a stretch already fully marked.
    if (unmarked.length === 0) continue;

    out.push({
      from: a.delivery,
      to: b.pickup,
      days: days.length,
      droppedAt: a.city,
      nextPickup: b.fromCity,
      homeTrip: days.some((d) => homeTrips.has(d)),
      alreadyMarked: days.length - unmarked.length,
      unmarked,
    });
  }
  // Longest first: the expensive ones are the ones worth settling. Capped,
  // because a list nobody finishes reading is a list nobody acts on.
  return out.sort((x, y) => y.days - x.days).slice(0, MAX_CANDIDATES);
};

/** Every unmarked day across the given gaps, deduped and ordered. */
export const daysToMark = (gaps: readonly HomeGap[]): string[] =>
  [...new Set(gaps.flatMap((g) => g.unmarked))].sort();
