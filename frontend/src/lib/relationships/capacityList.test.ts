import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { cityKey, type CoordMap } from "@/lib/metrics/foreman";
import {
  capacityList,
  clockWord,
  emptyNextWhen,
  emptyTense,
  emptyWhenLabel,
  footprintPoints,
  nearestFootprint,
  roundMiles,
  type CapacityContactLike,
  type EmptyNext,
} from "./capacityList";
import type { BookAgentLike } from "./buckets";

// Michigan / Ohio, straight-line from Walker, MI (the nod sheet's real anchor).
const COORDS: CoordMap = new Map([
  [cityKey("Walker", "MI"), { lat: 43.0014, lng: -85.7681 }],
  [cityKey("Archbold", "OH"), { lat: 41.5217, lng: -84.3072 }], // ~126 mi
  [cityKey("Bruce Twp", "MI"), { lat: 42.7967, lng: -83.0166 }], // ~141 mi
  [cityKey("Columbus", "OH"), { lat: 39.9612, lng: -82.9988 }], // ~250 mi
  [cityKey("Grand Rapids", "MI"), { lat: 42.9634, lng: -85.6681 }], // ~6 mi
]);
const WALKER = { city: "Walker", state: "MI" };
const NOW = new Date(2026, 8, 14, 10); // Monday Sep 14, local

const agent = (id: string, o: Partial<BookAgentLike> = {}): BookAgentLike => ({
  agent_id: id,
  first_name: id,
  last_name: "X",
  relationship_tier: null,
  work_status: "active",
  created_at: "2026-08-01T00:00:00Z",
  ...o,
});

const load = (o: Partial<Load>): Load =>
  ({
    load_id: `${o.agent_id}-${o.origin_city}`,
    load_status: "delivered",
    pickup_date: "2026-08-20",
    delivery_date: "2026-08-22",
    destination_city: "Walker",
    destination_state: "MI",
    ...o,
  }) as unknown as Load;

const touch = (agent_id: string, day: string, type = "capacity"): CapacityContactLike => ({
  agent_id,
  contacted_at: new Date(`${day}T15:00:00`).toISOString(), // local afternoon
  direction: "outbound",
  method: "email",
  type,
  outcome: null,
});

describe("footprintPoints — distinct delivered origins + stated markets", () => {
  it("dedupes by city, skips other agents, non-delivered loads and blanks", () => {
    const loads = [
      load({ agent_id: "a", origin_city: "Archbold", origin_state: "OH" }),
      load({ agent_id: "a", origin_city: "ARCHBOLD", origin_state: "oh", load_id: "dupe" }),
      load({ agent_id: "a", origin_city: "Columbus", origin_state: "OH", load_status: "booked" }),
      load({ agent_id: "b", origin_city: "Columbus", origin_state: "OH" }),
      load({ agent_id: "a", origin_city: "", origin_state: "OH", load_id: "blank" }),
    ];
    const coverage = [
      { agent_id: "a", city: "Bruce Twp", state: "MI" },
      { agent_id: "a", city: "Archbold", state: "OH" },
    ];
    expect(footprintPoints("a", loads, coverage)).toEqual([
      { city: "Archbold", state: "OH", source: "load" },
      { city: "Bruce Twp", state: "MI", source: "coverage" },
    ]);
    expect(footprintPoints("z", loads, coverage)).toEqual([]);
  });
});

describe("nearestFootprint — the closest point with a trusted coordinate", () => {
  it("picks the nearest and skips cities the cache does not know", () => {
    const near = nearestFootprint(
      [
        { city: "Columbus", state: "OH", source: "load" },
        { city: "Nowhere", state: "XX", source: "coverage" },
        { city: "Archbold", state: "OH", source: "coverage" },
      ],
      COORDS,
      COORDS.get(cityKey("Walker", "MI"))!,
    );
    expect(near?.place).toEqual({ city: "Archbold", state: "OH" });
    expect(near?.miles).toBeCloseTo(126, -1);
    expect(nearestFootprint([{ city: "Nowhere", state: "XX", source: "load" }], COORDS, { lat: 0, lng: 0 })).toBeNull();
    expect(nearestFootprint([], COORDS, { lat: 0, lng: 0 })).toBeNull();
  });
});

describe("capacityList — the 150-mi list from the Foreman's anchor", () => {
  const agents = [
    agent("liam"), // Archbold, 1 load Feb 27 (199 days) → dormant → Parked (derived)
    agent("guy"), // Bruce Twp, 141 mi, prospect
    agent("far"), // Columbus, 250 mi
    agent("near", { relationship_tier: 2 }), // Grand Rapids, 6 mi, Tier 2
    agent("never"), // no loads, no coverage
    agent("stated"), // coverage only → Archbold
    agent("parkedNear", { work_status: "parked" }), // explicit park, Grand Rapids
  ];
  const loads = [
    load({ agent_id: "liam", origin_city: "Archbold", origin_state: "OH", pickup_date: "2026-02-25", delivery_date: "2026-02-27" }),
    load({ agent_id: "guy", origin_city: "Bruce Twp", origin_state: "MI", pickup_date: "2026-05-02", delivery_date: "2026-05-04" }),
    load({ agent_id: "far", origin_city: "Columbus", origin_state: "OH" }),
    load({ agent_id: "near", origin_city: "Grand Rapids", origin_state: "MI" }),
    load({ agent_id: "parkedNear", origin_city: "Grand Rapids", origin_state: "MI" }),
  ];
  const coverage = [{ agent_id: "stated", city: "Archbold", state: "OH" }];
  const liamOld = agents.map((a) => (a.agent_id === "liam" ? { ...a, created_at: "2025-01-01T00:00:00Z" } : a));

  it("rows within 150 mi, nearest first; far, never-ran and parked stay out; parked within 75 are counted", () => {
    const list = capacityList(liamOld, loads, coverage, COORDS, WALKER, { contacts: [], now: NOW });
    expect(list.anchorResolved).toBe(true);
    expect(list.rows.map((r) => r.agent.agent_id)).toEqual(["near", "stated", "guy"]);
    expect(list.rows[0].bucket).toBe("tier2");
    expect(list.rows[2].nearestPlace).toEqual({ city: "Bruce Twp", state: "MI" });
    expect(list.rows[2].miles).toBeCloseTo(141, -1);
    expect(list.touched).toEqual([]);
    // liam is dormant-Parked at 126 mi (outside 75) and parkedNear is explicit at 6 mi
    expect(list.parkedNearby).toBe(1);
  });

  it("an agent already touched this week folds out of the rows", () => {
    const list = capacityList(liamOld, loads, coverage, COORDS, WALKER, { contacts: [touch("guy", "2026-09-14")], now: NOW });
    expect(list.rows.map((r) => r.agent.agent_id)).toEqual(["near", "stated"]);
    expect(list.touched.map((r) => r.agent.agent_id)).toEqual(["guy"]);
    // last week's touch does not count
    const last = capacityList(liamOld, loads, coverage, COORDS, WALKER, { contacts: [touch("guy", "2026-09-11")], now: NOW });
    expect(last.rows).toHaveLength(3);
  });

  it("an operational touch this week is not a cap hit", () => {
    const list = capacityList(liamOld, loads, coverage, COORDS, WALKER, { contacts: [touch("guy", "2026-09-14", "close_out")], now: NOW });
    expect(list.rows.map((r) => r.agent.agent_id)).toContain("guy");
  });

  it("no anchor, or an anchor without a trusted coordinate → an empty, unresolved list", () => {
    expect(capacityList(agents, loads, coverage, COORDS, null, { contacts: [], now: NOW })).toEqual({ anchorResolved: false, rows: [], touched: [], parkedNearby: 0 });
    expect(capacityList(agents, loads, coverage, COORDS, { city: "Rapid City", state: "SD" }, { contacts: [], now: NOW }).anchorResolved).toBe(false);
    expect(capacityList([], loads, coverage, COORDS, WALKER, { contacts: [], now: NOW }).rows).toEqual([]);
  });

  it("with the loads slice missing nobody is shelved Parked by derivation — the list still reads the explicit book", () => {
    const list = capacityList(liamOld, loads, coverage, COORDS, WALKER, { contacts: [], now: NOW, loadsReady: false });
    // liam and "stated" share Archbold's miles — a stable sort keeps the book's order
    expect(list.rows.map((r) => r.agent.agent_id)).toEqual(["near", "liam", "stated", "guy"]);
  });
});

describe("emptyNextWhen / emptyWhenLabel — the day and time the truck goes empty", () => {
  const delivered = load({ agent_id: "a", origin_city: "Archbold", origin_state: "OH", destination_city: "Vicksburg", destination_state: "MS", delivery_date: "2026-09-09" });

  it("the furthest-out committed load's destination, delivery day and appointment", () => {
    const loads = [
      delivered,
      load({ agent_id: "a", load_id: "b1", load_status: "booked", destination_city: "Walker", destination_state: "MI", pickup_date: "2026-09-16", delivery_date: "2026-09-18", delivery_appt_start: "14:00:00" }),
      load({ agent_id: "a", load_id: "b0", load_status: "in_transit", destination_city: "Toledo", destination_state: "OH", pickup_date: "2026-09-14", delivery_date: "2026-09-15" }),
    ];
    const e = emptyNextWhen(loads);
    expect(e).toEqual({ city: "Walker", state: "MI", source: "committed", dayKey: "2026-09-18", time: "14:00:00" });
    expect(emptyWhenLabel(e)).toBe("Friday 2pm");
    expect(emptyWhenLabel(e, "short")).toBe("Fri 2pm");
  });

  it("a window uses its end; no appointment → just the day", () => {
    const e = emptyNextWhen([load({ agent_id: "a", load_id: "w", load_status: "booked", delivery_date: "2026-09-18", delivery_appt_start: "08:00:00", delivery_appt_end: "10:30:00" })]);
    expect(e?.time).toBe("10:30:00");
    expect(emptyWhenLabel(e)).toBe("Friday 10:30am");
    expect(emptyWhenLabel(emptyNextWhen([load({ agent_id: "a", load_id: "n", load_status: "booked", delivery_date: "2026-09-18" })]))).toBe("Friday");
  });

  it("nothing committed → already empty at the last delivery → 'now'", () => {
    const e = emptyNextWhen([delivered]);
    expect(e).toEqual({ city: "Vicksburg", state: "MS", source: "last-delivered", dayKey: "2026-09-09", time: null });
    expect(emptyTense(e)).toBe("now");
    expect(emptyWhenLabel(e)).toBe("now");
    expect(emptyNextWhen([])).toBeNull();
    expect(emptyTense(null)).toBe("now");
    expect(emptyWhenLabel(null)).toBe("now");
  });

  it("a committed load with no delivery date yet → 'after our next drop' — the truck is loaded, never 'now'", () => {
    const e = emptyNextWhen([
      delivered,
      load({ agent_id: "a", load_id: "tbd", load_status: "booked", destination_city: "Walker", destination_state: "MI", pickup_date: "2026-09-16", delivery_date: null }),
    ]);
    expect(e).toEqual({ city: "Walker", state: "MI", source: "committed", dayKey: null, time: null });
    expect(emptyTense(e)).toBe("unscheduled");
    expect(emptyWhenLabel(e)).toBe("after our next drop");
    expect(emptyWhenLabel(e, "short")).toBe("after our next drop");
  });

  it("emptyTense — the three answers every caller branches on", () => {
    const walker = { city: "Walker", state: "MI" };
    const later: EmptyNext = { ...walker, source: "committed", dayKey: "2026-09-18", time: null };
    const unscheduled: EmptyNext = { ...walker, source: "committed", dayKey: null, time: "14:00:00" };
    const now: EmptyNext = { ...walker, source: "last-delivered", dayKey: "2026-09-09", time: null };
    expect(emptyTense(later)).toBe("later");
    expect(emptyTense(unscheduled)).toBe("unscheduled");
    expect(emptyTense(now)).toBe("now");
    expect(emptyWhenLabel(later)).toBe("Friday");
    expect(emptyWhenLabel(unscheduled)).toBe("after our next drop"); // a time without a day is no day
    expect(emptyWhenLabel(now, "short")).toBe("now");
  });

  it("clockWord and roundMiles speak the draft's words", () => {
    expect(clockWord("14:00:00")).toBe("2pm");
    expect(clockWord("14:30:00")).toBe("2:30pm");
    expect(clockWord("00:15:00")).toBe("12:15am");
    expect(clockWord("12:00:00")).toBe("12pm");
    expect(clockWord(null)).toBeNull();
    expect(roundMiles(126.4)).toBe(130);
    expect(roundMiles(141)).toBe(140);
    expect(roundMiles(3)).toBe(10);
  });
});

// Decision 5A: a load contributes its FOOTPRINT point, not blindly its origin.
describe("footprintPoints — the customer-end mark decides the point", () => {
  it("a receiver-end load places the agent at the DESTINATION", () => {
    const loads = [
      load({
        agent_id: "a",
        customer_end: "receiver",
        origin_city: "Columbus", // the tradeshow marshalling yard
        origin_state: "OH",
        destination_city: "Archbold", // the agent's own customer
        destination_state: "OH",
      }),
    ];
    expect(footprintPoints("a", loads, [])).toEqual([
      { city: "Archbold", state: "OH", source: "load" },
    ]);
  });

  it("a 'neither' load contributes nothing at all", () => {
    const loads = [
      load({ agent_id: "a", customer_end: "neither", origin_city: "Columbus", origin_state: "OH" }),
    ];
    expect(footprintPoints("a", loads, [])).toEqual([]);
    // the market they NAMED still counts — a claim is not a load
    expect(footprintPoints("a", loads, [{ agent_id: "a", city: "Archbold", state: "OH" }])).toEqual([
      { city: "Archbold", state: "OH", source: "coverage" },
    ]);
  });

  it("an un-marked load reads as shipper — the origin, exactly as before 074", () => {
    const loads = [load({ agent_id: "a", origin_city: "Archbold", origin_state: "OH" })];
    expect(footprintPoints("a", loads, [])).toEqual([
      { city: "Archbold", state: "OH", source: "load" },
    ]);
  });

  it("the capacity list measures from the marked end — a receiver-end load brings the agent into the 150", () => {
    const agents = [agent("mike")];
    const loads = [
      load({
        agent_id: "mike",
        customer_end: "receiver",
        origin_city: "Columbus", // ~250 mi — outside the radius
        origin_state: "OH",
        destination_city: "Archbold", // ~126 mi — inside it
        destination_state: "OH",
      }),
    ];
    const out = capacityList(agents, loads, [], COORDS, WALKER, { contacts: [], now: NOW });
    expect(out.rows.map((r) => r.agent.agent_id)).toEqual(["mike"]);
    expect(out.rows[0].nearestPlace).toEqual({ city: "Archbold", state: "OH" });
    expect(Math.round(out.rows[0].miles)).toBeGreaterThan(100);
    expect(Math.round(out.rows[0].miles)).toBeLessThan(150);
  });

  it("a book of nothing but 'neither' loads yields an empty list, not a guess", () => {
    const agents = [agent("mike")];
    const loads = [
      load({ agent_id: "mike", customer_end: "neither", origin_city: "Archbold", origin_state: "OH" }),
    ];
    const out = capacityList(agents, loads, [], COORDS, WALKER, { contacts: [], now: NOW });
    expect(out).toEqual({ anchorResolved: true, rows: [], touched: [], parkedNearby: 0 });
  });
});
