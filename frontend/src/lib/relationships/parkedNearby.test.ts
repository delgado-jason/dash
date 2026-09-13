import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import { cityKey, haversineMiles, type CoordMap } from "@/lib/metrics/foreman";
import type { MeaningfulContactLike } from "./meaningfulContact";
import { parkedNearby, parkedNearbyExplicitOnly } from "./parkedNearby";

const NOW = new Date("2026-09-12T15:00:00Z");

let seq = 0;
const mkLoad = (o: Partial<Load>): Load => ({
  load_id: `L${seq++}`,
  load_number: "N",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b1",
  broker: "B",
  agent_id: "a1",
  agent: "Agent",
  agent_email: null,
  pickup_date: "2026-01-10", // 200+ days ago — dormant unless something else says otherwise
  delivery_date: "2026-01-12",
  origin_market_id: "m1",
  origin_city: "Akron",
  origin_state: "OH",
  origin_market: "Akron",
  destination_market_id: "m2",
  destination_city: "Dallas",
  destination_state: "TX",
  delivery_market: "Dallas",
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "2500",
  fuel_surcharge: "200",
  total_accessorials: "0",
  commodity: null,
  payment_status: "paid",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...o,
});

const mkAgent = (id: string, o: Partial<Agent> = {}): Agent => ({
  agent_id: id,
  broker_id: "b1",
  broker_name: "EWT",
  first_name: id,
  last_name: "Agent",
  preferred_contact: null,
  relationship_tier: null,
  work_status: "active",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...o,
});

// NE Ohio, anchored at Macedonia (the Foreman test's geography).
const COORDS: CoordMap = new Map([
  [cityKey("Macedonia", "OH"), { lat: 41.31, lng: -81.5 }],
  [cityKey("Akron", "OH"), { lat: 41.08, lng: -81.52 }], // ~16 mi
  [cityKey("Youngstown", "OH"), { lat: 41.1, lng: -80.65 }], // ~46 mi
  [cityKey("Columbus", "OH"), { lat: 39.96, lng: -82.99 }], // ~122 mi
  [cityKey("Pittsburgh", "PA"), { lat: 40.44, lng: -79.99 }], // ~99 mi
]);
const ANCHOR = { city: "Macedonia", state: "OH" };

describe("parkedNearby — parked agents within 75 straight-line miles of the anchor", () => {
  it("includes a dormant one-off inside 75 mi and leaves one outside out; nearest point first", () => {
    seq = 0;
    const agents = [mkAgent("far"), mkAgent("near"), mkAgent("mid")];
    const loads = [
      mkLoad({ agent_id: "near", origin_city: "Akron", origin_state: "OH" }),
      mkLoad({ agent_id: "mid", origin_city: "Youngstown", origin_state: "OH" }),
      mkLoad({ agent_id: "far", origin_city: "Columbus", origin_state: "OH" }),
    ];
    const rows = parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["near", "mid"]);
    expect(rows[0].miles).toBeLessThan(19);
    expect(rows[0].place).toEqual({ city: "Akron", state: "OH" });
    expect(rows[0].dormant).toBe(true);
    expect(rows[0].since).toBe("2026-01-12"); // the delivery — the last two-way day
    expect(rows[0].reason).toBeNull();
    expect(rows[0].delivered).toBe(1);
    expect(rows[0].gross).toBe(2700);
    expect(rows[0].daysQuiet).toBe(243);
  });

  it("an explicitly parked agent is included too, with the owner's reason, and a stated market counts as footprint", () => {
    const agents = [mkAgent("mary", { work_status: "parked", park_reason: "office personnel, not the decision-maker", relationship_tier: 2 })];
    // no loads at all — her footprint is the market she named
    const rows = parkedNearby(agents, [], [{ agent_id: "mary", city: "Akron", state: "OH" }], COORDS, ANCHOR, [], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].dormant).toBe(false);
    expect(rows[0].reason).toBe("office personnel, not the decision-maker");
    expect(rows[0].since).toBeNull();
    expect(rows[0].daysQuiet).toBeNull();
    expect(rows[0].delivered).toBe(0);
    expect(rows[0].gross).toBe(0);
  });

  it("the NEAREST footprint point decides — a far load origin plus a near stated market is near", () => {
    const rows = parkedNearby(
      [mkAgent("a")],
      [mkLoad({ agent_id: "a", origin_city: "Columbus", origin_state: "OH" })],
      [{ agent_id: "a", city: "Youngstown", state: "OH" }],
      COORDS,
      ANCHOR,
      [],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].place).toEqual({ city: "Youngstown", state: "OH" });
  });

  it("no coordinate → excluded, never a guessed distance; no anchor coordinate → nothing at all", () => {
    const loads = [mkLoad({ agent_id: "a", origin_city: "Nowhere", origin_state: "OH" })];
    expect(parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW)).toEqual([]);
    expect(parkedNearby([mkAgent("a")], [mkLoad({ agent_id: "a" })], [], COORDS, { city: "Reno", state: "NV" }, [], NOW)).toEqual([]);
    expect(parkedNearby([mkAgent("a")], [mkLoad({ agent_id: "a" })], [], COORDS, null, [], NOW)).toEqual([]);
  });

  it("active agents never appear — a live prospect, a tiered agent, or a dormant-looking one a reached call woke", () => {
    const agents = [mkAgent("live"), mkAgent("tier", { relationship_tier: 3 }), mkAgent("woken")];
    const loads = [
      mkLoad({ agent_id: "live", pickup_date: "2026-08-20", delivery_date: "2026-08-22" }),
      mkLoad({ agent_id: "tier" }),
      mkLoad({ agent_id: "woken" }),
    ];
    const reached: MeaningfulContactLike = { agent_id: "woken", contacted_at: "2026-09-01T10:00:00Z", direction: "outbound", method: "call", outcome: "reached" };
    expect(parkedNearby(agents, loads, [], COORDS, ANCHOR, [reached], NOW)).toEqual([]);
  });

  it("a wider radius is a parameter; empty inputs → empty", () => {
    const loads = [mkLoad({ agent_id: "far", origin_city: "Columbus", origin_state: "OH" })];
    expect(parkedNearby([mkAgent("far")], loads, [], COORDS, ANCHOR, [], NOW, 150)).toHaveLength(1);
    expect(parkedNearby([], [], [], COORDS, ANCHOR, [], NOW)).toEqual([]);
  });

  it("a footprint point at exactly the radius — 75.0 mi — is in; a hair beyond is out", () => {
    const anchor = COORDS.get(cityKey("Macedonia", "OH"))!;
    // Due north along the meridian, so the great-circle distance IS the arc:
    // miles / Earth's radius (the Foreman's 3958.7613) in degrees.
    const north = (mi: number) => ({ lat: anchor.lat + (mi / 3958.7613) * (180 / Math.PI), lng: anchor.lng });
    const coords: CoordMap = new Map([...COORDS, [cityKey("Edge", "OH"), north(75 - 1e-9)], [cityKey("Over", "OH"), north(75 + 1e-6)]]);
    expect(haversineMiles(anchor, coords.get(cityKey("Edge", "OH"))!)).toBeCloseTo(75, 6);
    const rows = parkedNearby(
      [mkAgent("edge"), mkAgent("over")],
      [mkLoad({ agent_id: "edge", origin_city: "Edge" }), mkLoad({ agent_id: "over", origin_city: "Over" })],
      [],
      coords,
      ANCHOR,
      [],
      NOW,
    );
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["edge"]);
    expect(rows[0].miles).toBeCloseTo(75, 6);
  });

  it("gross sums DELIVERED loads only, and daysQuiet reads the later of the last two-way contact and the last load day — null when there is neither", () => {
    const agents = [mkAgent("mary", { work_status: "parked", park_reason: "spot only" }), mkAgent("bare", { work_status: "parked", park_reason: "no freight" })];
    const loads = [
      mkLoad({ agent_id: "mary", linehaul: "2500", fuel_surcharge: "200" }), // 2,700 — Jan 12
      mkLoad({ agent_id: "mary", load_status: "booked", linehaul: "9000", pickup_date: "2026-03-01", delivery_date: null }),
      mkLoad({ agent_id: "mary", load_status: "cancelled", linehaul: "9000", pickup_date: "2026-09-01", delivery_date: "2026-09-02" }),
    ];
    const reached: MeaningfulContactLike = { agent_id: "mary", contacted_at: "2026-06-01T10:00:00Z", direction: "outbound", method: "call", outcome: "reached" };
    const rows = parkedNearby(agents, loads, [{ agent_id: "bare", city: "Akron", state: "OH" }], COORDS, ANCHOR, [reached], NOW);
    const by = Object.fromEntries(rows.map((r) => [r.agent.agent_id, r]));
    expect(by.mary.delivered).toBe(1);
    expect(by.mary.gross).toBe(2700); // the booked and the cancelled load never count
    expect(by.mary.daysQuiet).toBe(103); // Jun 1 → Sep 12: the reached call, later than any load day
    expect(by.bare.delivered).toBe(0);
    expect(by.bare.gross).toBe(0);
    expect(by.bare.daysQuiet).toBeNull(); // never a contact, never a load
  });

  it("parkedNearbyExplicitOnly — no contact log: the owner's parks only, quiet days withheld (undefined), a dormant one-off left out", () => {
    const agents = [mkAgent("dorm"), mkAgent("mary", { work_status: "parked", park_reason: "spot only" })];
    const loads = [mkLoad({ agent_id: "dorm" }), mkLoad({ agent_id: "mary" })];
    const rows = parkedNearbyExplicitOnly(agents, loads, [], COORDS, ANCHOR, NOW);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["mary"]);
    expect(rows[0].daysQuiet).toBeUndefined();
    expect(rows[0].dormant).toBe(false);
    expect(rows[0].reason).toBe("spot only");
    expect(rows[0].gross).toBe(2700);
    // the same book once the log has landed → both
    expect(parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW).map((r) => r.agent.agent_id).sort()).toEqual(["dorm", "mary"]);
    expect(parkedNearbyExplicitOnly([], [], [], COORDS, ANCHOR, NOW)).toEqual([]);
  });
});

// Decision 5A: the footprint follows the load's customer-end mark, so the
// parked harvest group measures from the end the agent's customer sits on.
describe("parkedNearby — the customer-end mark decides the point", () => {
  it("a receiver-end load places the agent at the DESTINATION", () => {
    seq = 0;
    const agents = [mkAgent("mike")];
    const loads = [
      mkLoad({
        agent_id: "mike",
        customer_end: "receiver",
        origin_city: "Columbus", // ~122 mi — a one-time pickup, outside the radius
        origin_state: "OH",
        destination_city: "Akron", // ~16 mi — the agent's own customer
        destination_state: "OH",
      }),
    ];
    const rows = parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["mike"]);
    expect(rows[0].place).toEqual({ city: "Akron", state: "OH" });
    expect(rows[0].miles).toBeLessThan(19);
  });

  it("a 'neither' load contributes no point — the agent drops out entirely", () => {
    seq = 0;
    const agents = [mkAgent("mike")];
    const loads = [
      mkLoad({
        agent_id: "mike",
        customer_end: "neither",
        origin_city: "Akron",
        origin_state: "OH",
        destination_city: "Akron",
        destination_state: "OH",
      }),
    ];
    expect(parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW)).toEqual([]);
    // ... unless a market they NAMED still puts them in range.
    const rows = parkedNearby(agents, loads, [{ agent_id: "mike", city: "Akron", state: "OH" }], COORDS, ANCHOR, [], NOW);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["mike"]);
  });

  it("an un-marked load still reads as shipper — the origin, exactly as before 074", () => {
    seq = 0;
    const agents = [mkAgent("mike")];
    const loads = [mkLoad({ agent_id: "mike", origin_city: "Akron", origin_state: "OH", destination_city: "Columbus", destination_state: "OH" })];
    const rows = parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW);
    expect(rows[0].place).toEqual({ city: "Akron", state: "OH" });
  });
});
