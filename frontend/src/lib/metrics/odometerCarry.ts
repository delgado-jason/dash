// Where the NEXT load's odometer starts.
//
// Jason's rule, 2026-11-10: "the odometer should carry over from the last load
// unless it's a trip … It needs to be able to tell the difference when I'm on
// a trip versus when I'm rolling over into another load. That's an absolute
// must."
//
// His instinct was right and his own chain already obeys it by hand — every
// load and trip for the last two months tiles exactly. But the failure he was
// bracing for is the one that CANNOT happen: the odometer only ever goes up,
// so a trip that ran after a load necessarily has the higher reading and wins
// on its own. "Did a trip come after?" answers itself.
//
// The failure that CAN happen, and was live on prod the day this was written,
// is a fuel stop. `GET /trips/latest-odometer` takes
//   GREATEST(max load end, max trip end, max FUEL reading, max service)
// and on 2026-11-10 that returned 612,828 — the Cisco fill — while load
// 4493038 was still rolling from 612,773. A fill is not the end of a journey;
// it is a point INSIDE one. Prefilling it would have started the next load
// before the current one finished, and the missing miles would have landed
// silently in deadhead, which is odometer-derived.
//
// So the rule here is stricter than "check for a trip":
//
//   The next load starts where the last COMPLETED MOVEMENT ended — a load or a
//   trip, whichever is later by date. Fuel and shop readings are never
//   movements. And while anything is still rolling there is no answer at all,
//   so it refuses rather than guessing.
//
// A blank field gets filled in. A wrong number gets trusted. That asymmetry is
// why every uncertain case here returns null with a reason.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

export type CarrySource = "load" | "trip";

export interface CarryReading {
  reading: number;
  source: CarrySource;
  /** The load number or the trip's date — what to name on screen. */
  ref: string;
  /** The day that movement ended. */
  date: string;
}

export type CarryWhy =
  | "rolling" // something is still on the road; the end is not known yet
  | "none" // nothing has ever closed — the first load on a fresh book
  | "contradictory"; // the latest movement by date is not the highest reading

export interface Carry {
  reading: number | null;
  source: CarrySource | null;
  ref: string | null;
  date: string | null;
  why: CarryWhy | null;
}

const REFUSE = (why: CarryWhy): Carry => ({ reading: null, source: null, ref: null, date: null, why });

const day = (v: string | null | undefined): string | null => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A load that never ran carries no movement. A TONU is the clearest case:
// Jason's 4115417 has an odometer_start typed and no end, because the truck
// turned up and left again — it must never seed the next load.
const NEVER_RAN = new Set(["cancelled", "tonu"]);

/**
 * The odometer the next load should START at, or a refusal with the reason.
 *
 * `loads` and `trips` are the whole book; order does not matter.
 */
export const nextLoadStart = (loads: Load[], trips: Trip[]): Carry => {
  // Anything on the road means the end of the current span is unknown, and no
  // honest number exists for the one after it.
  const rolling =
    loads.some((l) => l.load_status === "in_transit") ||
    trips.some((t) => t.status === "active");
  if (rolling) return REFUSE("rolling");

  const done: CarryReading[] = [];
  for (const l of loads) {
    if (NEVER_RAN.has(String(l.load_status))) continue;
    const end = num(l.odometer_end);
    const d = day(l.delivery_date);
    // Both halves or it is not a closed movement. A load with an end and no
    // date cannot be ordered against a trip, so it cannot be trusted to be
    // the latest.
    if (end != null && d) done.push({ reading: end, source: "load", ref: l.load_number, date: d });
  }
  for (const t of trips) {
    if (t.status === "cancelled") continue;
    const end = num(t.odometer_end);
    const d = day(t.trip_date);
    if (end != null && d) done.push({ reading: end, source: "trip", ref: d, date: d });
  }
  if (done.length === 0) return REFUSE("none");

  // Latest by DATE, and on a tie the higher reading — two movements closing on
  // one day are in odometer order, because the odometer is the clock that
  // cannot run backwards.
  const latest = done.reduce((a, b) =>
    b.date > a.date || (b.date === a.date && b.reading > a.reading) ? b : a,
  );

  // The monotonic check, which is the whole safety net. If the latest movement
  // by date is NOT the highest reading on the book, something is mistyped and
  // the two orderings disagree. There is no safe pick between them, so it
  // refuses and the field stays blank for a human to settle.
  const highest = done.reduce((a, b) => (b.reading > a.reading ? b : a));
  if (highest.reading > latest.reading) return REFUSE("contradictory");

  return { reading: latest.reading, source: latest.source, ref: latest.ref, date: latest.date, why: null };
};

// What the field says under the number, so a wrong carry is obvious at a
// glance rather than trusted silently (the metric-transparency rule).
export const carryWords = (c: Carry): string => {
  if (c.reading != null)
    return c.source === "trip" ? `from the ${c.ref} trip` : `from load ${c.ref}'s delivery`;
  switch (c.why) {
    case "rolling":
      return "a load is still rolling — its end odometer sets this one";
    case "contradictory":
      return "the latest run is not the highest reading — check the odometers";
    default:
      return "no completed run to carry from yet";
  }
};
