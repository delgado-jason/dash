// The capacity pass (REL-01 v2.0 §5B, ADMIN-02 v1.1 §5B) — the primary
// nurture. When the truck goes empty, every agent with freight within 150
// straight-line miles of the empty point gets a short heads-up, sent by hand.
//   Anchor     the Foreman's "where you'll be empty next" (emptyNextAnchor),
//              resolved through the same trusted city_coords cache; no
//              coordinate → no list, the plate says so and points at the
//              Foreman rather than inventing miles.
//   Footprint  DISTINCT footprint cities of the agent's DELIVERED loads — the
//              origin, or the destination when the agent's customer took
//              delivery (decision 5A) — plus the markets they named
//              (agent_coverage); no new geometry. A point without a trusted
//              coordinate is skipped.
//   Who        the active book (tiered or prospect) — Parked, explicit or
//              dormant, never gets a capacity email; parked agents within 75
//              mi are counted for the Foreman's harvest group instead.
//   The cap    an agent who already had a proactive touch this week is folded
//              out into "already touched this week" — one message a week.
import type { Load } from "@/types/load";
import { cityKey, haversineMiles, type CityCoord, type CoordMap } from "@/lib/metrics/foreman";
import { footprintPoint, type CustomerEndLoadLike } from "@/lib/loads/customerEnd";
import { bucketOf, type Bucket, type BookAgentLike } from "./buckets";
import { capStatus, type CapContactLike } from "./contactCap";
import { keyOf } from "./dayKeys";
import type { MeaningfulContactLike, MeaningfulLoadLike } from "./meaningfulContact";

export const CAPACITY_RADIUS_MILES = 150;
export const PARKED_RADIUS_MILES = 75;

export interface Place {
  city: string;
  state: string;
}

export interface FootprintPoint extends Place {
  source: "load" | "coverage";
}

// A load contributes its FOOTPRINT POINT, not blindly its origin: the origin
// on a normal load, the destination when the agent's customer took delivery,
// nothing at all on a 'neither' load (decision 5A).
export interface FootprintLoadLike extends CustomerEndLoadLike {
  agent_id?: string | null;
  load_status: string;
}

export interface FootprintCoverageLike {
  agent_id: string;
  city: string;
  state: string;
}

// Where an agent's freight actually sits, plus where they say it does — one
// entry per distinct city. A load's contribution follows its customer-end
// mark (decision 5A), so the Atlanta tradeshow pickup delivered to the
// agent's own customer puts Troutman on the list, not Atlanta.
export const footprintPoints = (
  agentId: string,
  loads: FootprintLoadLike[],
  coverage: FootprintCoverageLike[],
): FootprintPoint[] => {
  const seen = new Set<string>();
  const out: FootprintPoint[] = [];
  const add = (city: string | null | undefined, state: string | null | undefined, source: FootprintPoint["source"]) => {
    const c = (city ?? "").trim();
    const s = (state ?? "").trim();
    if (!c || !s) return;
    const k = cityKey(c, s);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ city: c, state: s, source });
  };
  for (const l of loads)
    if (l.agent_id === agentId && l.load_status === "delivered") {
      const p = footprintPoint(l);
      if (p) add(p.city, p.state, "load");
    }
  for (const c of coverage) if (c.agent_id === agentId) add(c.city, c.state, "coverage");
  return out;
};

export interface Nearest {
  place: Place;
  miles: number;
}

// The footprint point closest to the anchor, among those with a trusted
// coordinate. null when none can be measured.
export const nearestFootprint = (points: FootprintPoint[], coords: CoordMap, anchor: CityCoord): Nearest | null => {
  let best: Nearest | null = null;
  for (const p of points) {
    const c = coords.get(cityKey(p.city, p.state));
    if (!c) continue;
    const miles = haversineMiles(anchor, c);
    if (best == null || miles < best.miles) best = { place: { city: p.city, state: p.state }, miles };
  }
  return best;
};

export interface CapacityRow<A> {
  agent: A;
  nearestPlace: Place;
  miles: number;
  bucket: Bucket;
}

export interface CapacityList<A> {
  anchorResolved: boolean; // the anchor city had a trusted coordinate
  rows: CapacityRow<A>[]; // active agents within 150 mi, clear to send — nearest first
  touched: CapacityRow<A>[]; // within 150 mi but already touched this week — the fold line
  parkedNearby: number; // parked (explicit or dormant) within 75 mi → the Foreman
}

export type CapacityContactLike = CapContactLike & MeaningfulContactLike;

export interface CapacityCtx {
  contacts: CapacityContactLike[];
  now: Date;
  loadsReady?: boolean;
}

export const capacityList = <A extends BookAgentLike>(
  agents: A[],
  loads: (FootprintLoadLike & MeaningfulLoadLike)[],
  coverage: FootprintCoverageLike[],
  coords: CoordMap,
  anchor: Place | null,
  ctx: CapacityCtx,
): CapacityList<A> => {
  const empty: CapacityList<A> = { anchorResolved: false, rows: [], touched: [], parkedNearby: 0 };
  if (!anchor) return empty;
  const anchorCoord = coords.get(cityKey(anchor.city, anchor.state));
  if (!anchorCoord) return empty;

  const bookCtx = { loads, contacts: ctx.contacts, now: ctx.now, loadsReady: ctx.loadsReady };
  const rows: CapacityRow<A>[] = [];
  const touched: CapacityRow<A>[] = [];
  let parkedNearby = 0;
  for (const a of agents) {
    const near = nearestFootprint(footprintPoints(a.agent_id, loads, coverage), coords, anchorCoord);
    if (!near) continue; // no footprint to be near — a never-ran prospect, or nothing geocoded yet
    const bucket = bucketOf(a, bookCtx);
    if (bucket === "parked") {
      if (near.miles <= PARKED_RADIUS_MILES) parkedNearby++;
      continue;
    }
    if (near.miles > CAPACITY_RADIUS_MILES) continue;
    const row: CapacityRow<A> = { agent: a, nearestPlace: near.place, miles: near.miles, bucket };
    if (capStatus(a.agent_id, ctx.contacts, ctx.now).blocked) touched.push(row);
    else rows.push(row);
  }
  const byMiles = (x: CapacityRow<A>, y: CapacityRow<A>) => x.miles - y.miles;
  rows.sort(byMiles);
  touched.sort(byMiles);
  return { anchorResolved: true, rows, touched, parkedNearby };
};

// Miles as the draft says them — "within about 130 miles", rounded to ten.
export const roundMiles = (miles: number): number => Math.max(10, Math.round(miles / 10) * 10);

// ---- when the truck goes empty ----
// The Foreman's anchor carries only the place; the DAY and TIME come from the
// same load it picked: the furthest-out committed load's delivery (its
// appointment when one is on file), or — nothing committed — the last
// delivery, which means the truck is empty now. Mirrors emptyNextAnchor's
// selection exactly so the two never disagree.
export interface EmptyNext extends Place {
  source: "committed" | "last-delivered";
  dayKey: string | null; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM:SS' — the delivery appointment (window end when it is a window)
}

const COMMITTED = new Set(["booked", "in_transit"]);
const refDay = (l: Load): string => l.delivery_date ?? l.pickup_date ?? "";

export const emptyNextWhen = (loads: Load[]): EmptyNext | null => {
  const committed = loads.filter((l) => COMMITTED.has(l.load_status) && l.destination_city && l.destination_state);
  if (committed.length) {
    const f = committed.reduce((best, l) => (refDay(l) > refDay(best) ? l : best));
    return {
      city: f.destination_city,
      state: f.destination_state,
      source: "committed",
      dayKey: f.delivery_date ? keyOf(f.delivery_date) : null,
      time: f.delivery_appt_end ?? f.delivery_appt_start ?? null,
    };
  }
  const delivered = loads.filter((l) => l.load_status === "delivered" && l.destination_city && l.destination_state && l.delivery_date);
  if (delivered.length) {
    const latest = delivered.reduce((best, l) => ((l.delivery_date as string) > (best.delivery_date as string) ? l : best));
    return { city: latest.destination_city, state: latest.destination_state, source: "last-delivered", dayKey: keyOf(latest.delivery_date as string), time: null };
  }
  return null;
};

// "2pm" · "2:30pm" from a Postgres time.
export const clockWord = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh)) return null;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? "am" : "pm";
  return mm ? `${h12}:${String(mm).padStart(2, "0")}${ampm}` : `${h12}${ampm}`;
};

const weekdayOfKey = (k: string, style: "short" | "long"): string =>
  new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" });

// The three answers to "when are you empty?" — every caller branches on THIS,
// never on the label's wording:
//   now          nothing committed: the truck sits empty at its last delivery
//   unscheduled  a committed load with no delivery date on file yet — empty
//                after that drop, day unknown (never "now": the truck is loaded)
//   later        a committed load with a delivery day (and maybe a time)
export type EmptyTense = "now" | "unscheduled" | "later";

export const emptyTense = (e: EmptyNext | null): EmptyTense => {
  if (!e || e.source === "last-delivered") return "now";
  return e.dayKey ? "later" : "unscheduled";
};

// The [day, time] the scripts fill in — "Friday 2pm" for the draft, "Fri 2pm"
// for the chip; "now" when the truck is already sitting empty; "after our
// next drop" when the committed load has no delivery date yet.
export const emptyWhenLabel = (e: EmptyNext | null, style: "short" | "long" = "long"): string => {
  const tense = emptyTense(e);
  if (tense === "now") return "now";
  if (tense === "unscheduled" || e?.dayKey == null) return "after our next drop";
  const clock = clockWord(e.time);
  const day = weekdayOfKey(e.dayKey, style);
  return clock ? `${day} ${clock}` : day;
};

export const placeLabel = (p: Place): string => `${p.city}, ${p.state}`;
