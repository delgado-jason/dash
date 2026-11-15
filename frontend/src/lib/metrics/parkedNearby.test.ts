import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import { cityKey, haversineMiles, type CoordMap } from "@/lib/metrics/foreman";
import { lastTouchByAgent, parkedNearby } from "@/lib/metrics/parkedNearby";
import { codeOf } from "@/lib/agencies/codeOf";

const NOW = new Date("2026-09-12T15:00:00Z");

let seq = 0;
const mkLoad = (o: Partial<Load>): Load => ({
  load_id: `L${seq++}`,
  load_number: "N",
  load_type: "standard flatbed",
  load_status: "delivered",
  agency_id: "b1",
  agency_code: "B",
  posting_code: null,
  agent_id: "a1",
  agent: "Agent",
  agent_email: null,
  pickup_date: "2026-01-10",
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
  agency_id: "b1",
  agency_code: "EWT",
  agency_name: null,
  posting_code: null,
  first_name: id,
  last_name: "Agent",
  preferred_contact: null,
  relationship_tier: null,
  work_status: "parked",
  park_reason: "spot agent",
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

describe("parkedNearby — the owner's parks within 75 straight-line miles of the anchor", () => {
  it("lists a park inside 75 mi, leaves one outside out, nearest first, with the reason and the money", () => {
    seq = 0;
    const agents = [mkAgent("far"), mkAgent("near", { park_reason: " Bad Number " }), mkAgent("mid")];
    const loads = [
      mkLoad({ agent_id: "near", origin_city: "Akron", origin_state: "OH" }),
      mkLoad({ agent_id: "mid", origin_city: "Youngstown", origin_state: "OH" }),
      mkLoad({ agent_id: "far", origin_city: "Columbus", origin_state: "OH" }),
    ];
    const rows = parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["near", "mid"]);
    expect(rows[0].miles).toBeLessThan(19);
    expect(rows[0].place).toEqual({ city: "Akron", state: "OH" });
    expect(rows[0].reason).toBe("Bad Number");
    expect(rows[0].delivered).toBe(1);
    expect(rows[0].gross).toBe(2700);
    expect(rows[0].lastWorked).toBe("2026-01-12");
    expect(rows[0].daysSinceSpoken).toBeNull(); // never called
  });

  it("a quiet ACTIVE desk is never parked by derivation — silence is not a park", () => {
    const agents = [mkAgent("quiet", { work_status: "active", park_reason: null })];
    const loads = [mkLoad({ agent_id: "quiet", pickup_date: "2025-01-10", delivery_date: "2025-01-12" })]; // 600 days ago
    expect(parkedNearby(agents, loads, [], COORDS, ANCHOR, [], NOW)).toEqual([]);
  });

  it("a stated market counts as footprint; the NEAREST point decides", () => {
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
    // no loads at all — the market named is the whole footprint
    const claimOnly = parkedNearby([mkAgent("m")], [], [{ agent_id: "m", city: "Akron", state: "OH" }], COORDS, ANCHOR, [], NOW);
    expect(claimOnly).toHaveLength(1);
    expect(claimOnly[0].delivered).toBe(0);
    expect(claimOnly[0].gross).toBe(0);
    expect(claimOnly[0].lastWorked).toBeNull();
  });

  it("no coordinate → excluded, never a guessed distance; no anchor coordinate → nothing at all", () => {
    const loads = [mkLoad({ agent_id: "a", origin_city: "Nowhere", origin_state: "OH" })];
    expect(parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW)).toEqual([]);
    expect(parkedNearby([mkAgent("a")], [mkLoad({ agent_id: "a" })], [], COORDS, { city: "Reno", state: "NV" }, [], NOW)).toEqual([]);
    expect(parkedNearby([mkAgent("a")], [mkLoad({ agent_id: "a" })], [], COORDS, null, [], NOW)).toEqual([]);
  });

  it("a wider radius is a parameter; empty inputs → empty", () => {
    const loads = [mkLoad({ agent_id: "a", origin_city: "Pittsburgh", origin_state: "PA" })]; // ~99 mi
    expect(parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW)).toEqual([]);
    expect(parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW, 120)).toHaveLength(1);
    expect(parkedNearby([], [], [], COORDS, ANCHOR, [], NOW)).toEqual([]);
  });

  it("a footprint point at exactly the radius is in; a hair beyond is out", () => {
    const anchorC = COORDS.get(cityKey("Macedonia", "OH"))!;
    const exact = { lat: anchorC.lat + 75 / 69.0, lng: anchorC.lng }; // ~75.0 mi north
    const miles = haversineMiles(anchorC, exact);
    const coords: CoordMap = new Map([...COORDS, [cityKey("Edge", "OH"), exact]]);
    const loads = [mkLoad({ agent_id: "a", origin_city: "Edge", origin_state: "OH" })];
    expect(parkedNearby([mkAgent("a")], loads, [], coords, ANCHOR, [], NOW, miles)).toHaveLength(1);
    expect(parkedNearby([mkAgent("a")], loads, [], coords, ANCHOR, [], NOW, miles - 0.01)).toHaveLength(0);
  });

  it("gross sums DELIVERED loads only; last spoken to reads the newest touch of ANY kind — an email counts", () => {
    seq = 0;
    const loads = [
      mkLoad({ agent_id: "a", linehaul: "1000", fuel_surcharge: "0" }),
      mkLoad({ agent_id: "a", linehaul: "9999", fuel_surcharge: "0", load_status: "booked", pickup_date: "2026-09-20", delivery_date: "2026-09-22" }),
      mkLoad({ agent_id: "a", linehaul: "9999", fuel_surcharge: "0", load_status: "cancelled" }),
    ];
    const contacts = [
      { agent_id: "a", contacted_at: "2026-08-01T10:00:00Z" },
      { agent_id: "a", contacted_at: "2026-09-02T10:00:00Z" }, // an email, ten days ago
      { agent_id: "other", contacted_at: "2026-09-11T10:00:00Z" },
    ];
    const [row] = parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, contacts, NOW);
    expect(row.delivered).toBe(1);
    expect(row.gross).toBe(1000);
    expect(row.daysSinceSpoken).toBe(10);
  });

  it("no contact log → the parks are listed and their quiet days read undefined", () => {
    const [row] = parkedNearby([mkAgent("a")], [mkLoad({ agent_id: "a" })], [], COORDS, ANCHOR, null, NOW);
    expect(row).toBeDefined();
    expect(row.daysSinceSpoken).toBeUndefined();
  });
});

describe("parkedNearby — the customer-end mark decides the point", () => {
  it("a receiver-end load places the agent at the DESTINATION", () => {
    const loads = [mkLoad({ agent_id: "a", origin_city: "Columbus", origin_state: "OH", destination_city: "Akron", destination_state: "OH", customer_end: "receiver" })];
    const [row] = parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW);
    expect(row.place).toEqual({ city: "Akron", state: "OH" });
  });

  it("a 'neither' load contributes no point — the agent drops out entirely", () => {
    const loads = [mkLoad({ agent_id: "a", customer_end: "neither" })];
    expect(parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW)).toEqual([]);
  });

  it("an un-marked load still reads as shipper — the origin", () => {
    const loads = [mkLoad({ agent_id: "a", origin_city: "Akron", origin_state: "OH", destination_city: "Columbus", destination_state: "OH" })];
    const [row] = parkedNearby([mkAgent("a")], loads, [], COORDS, ANCHOR, [], NOW);
    expect(row.place).toEqual({ city: "Akron", state: "OH" });
  });
});

describe("the code a parked-nearby row wears", () => {
  it("is the agent's own posting code, dashed, when it differs from the agency's", () => {
    const agent = mkAgent("a", { agency_code: "CPL", posting_code: "MAM" });
    const [row] = parkedNearby([agent], [mkLoad({ agent_id: "a" })], [], COORDS, ANCHOR, [], NOW);
    expect(codeOf(row.agent)).toEqual({ code: "MAM", kind: "posting" });
  });

  it("is the agency code, lit, for someone who posts from the desk itself", () => {
    const agent = mkAgent("a", { agency_code: "CPL", posting_code: null });
    const [row] = parkedNearby([agent], [mkLoad({ agent_id: "a" })], [], COORDS, ANCHOR, [], NOW);
    expect(codeOf(row.agent)).toEqual({ code: "CPL", kind: "agency" });
  });
});

describe("lastTouchByAgent", () => {
  it("keeps the newest day per agent and skips blanks", () => {
    const m = lastTouchByAgent([
      { agent_id: "a", contacted_at: "2026-09-02T10:00:00Z" },
      { agent_id: "a", contacted_at: "2026-09-10T23:59:00Z" },
      { agent_id: "a", contacted_at: "2026-08-01T10:00:00Z" },
      { agent_id: "", contacted_at: "2026-09-11T10:00:00Z" },
    ]);
    expect(m.get("a")).toBe("2026-09-10");
    expect(m.size).toBe(1);
  });
});
