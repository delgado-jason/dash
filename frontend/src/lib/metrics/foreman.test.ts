import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Agent } from "@/types/agent";
import {
  buildForemanBoard,
  emptyNextAnchor,
  haversineMiles,
  cityKey,
  type CoordMap,
} from "./foreman";

// ---- fixtures ----
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
  pickup_date: "2026-07-01",
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
  linehaul: "5800",
  fuel_surcharge: "200",
  total_accessorials: "0",
  commodity: null,
  payment_status: "paid",
  created_at: "2026-07-01",
  updated_at: "2026-07-01",
  ...o,
});

const mkAgent = (id: string, first: string): Agent => ({
  agent_id: id,
  broker_id: "b1",
  broker_name: "B",
  first_name: first,
  last_name: "Co",
  relationship_tier: 3,
  preferred_contact: "phone",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

// NE Ohio geography (real-ish centroids) — anchor is Macedonia, OH.
const COORDS: CoordMap = new Map([
  [cityKey("Macedonia", "OH"), { lat: 41.31, lng: -81.5 }],
  [cityKey("Akron", "OH"), { lat: 41.08, lng: -81.52 }], // ~16 mi
  [cityKey("Youngstown", "OH"), { lat: 41.1, lng: -80.65 }], // ~46 mi
  [cityKey("Columbus", "OH"), { lat: 39.96, lng: -82.99 }], // ~122 mi
  [cityKey("Pittsburgh", "PA"), { lat: 40.44, lng: -79.99 }], // ~99 mi
]);

const NOW = new Date("2026-08-13T12:00:00Z");

// A1 Summit: 5 delivered standard out of Akron, rpm 6.0 — deepest tie, closest.
// A2 Buckeye: 1 delivered oversize out of Columbus, rpm 8.0 — thin, far, top rate.
// A3 GreatLakes: 2 delivered standard out of Youngstown, rpm 5.5.
// A4 Keystone: 1 delivered standard out of Pittsburgh, rpm 5.0 — thin.
// Plus a BOOKED load (Akron → Macedonia) that sets the empty-next anchor.
const buildWorld = () => {
  seq = 0;
  const agents = [
    mkAgent("a1", "Summit"),
    mkAgent("a2", "Buckeye"),
    mkAgent("a3", "GreatLakes"),
    mkAgent("a4", "Keystone"),
  ];
  const loads: Load[] = [
    mkLoad({
      agent_id: "a1",
      load_status: "booked",
      origin_city: "Akron",
      origin_state: "OH",
      destination_city: "Macedonia",
      destination_state: "OH",
      pickup_date: "2026-08-17",
      delivery_date: "2026-08-19",
    }),
  ];
  for (let i = 0; i < 5; i++)
    loads.push(
      mkLoad({
        agent_id: "a1",
        origin_city: "Akron",
        origin_state: "OH",
        linehaul: "5800",
        fuel_surcharge: "200", // gross 6000 / 1000 = 6.0
        delivery_date: i === 0 ? "2026-08-08" : `2026-0${5 + (i % 3)}-10`,
      }),
    );
  loads.push(
    mkLoad({
      agent_id: "a2",
      load_type: "oversize",
      origin_city: "Columbus",
      origin_state: "OH",
      loaded_miles: 800,
      linehaul: "6200",
      fuel_surcharge: "200", // gross 6400 / 800 = 8.0
      delivery_date: "2026-07-15",
    }),
  );
  for (let i = 0; i < 2; i++)
    loads.push(
      mkLoad({
        agent_id: "a3",
        origin_city: "Youngstown",
        origin_state: "OH",
        linehaul: "5300",
        fuel_surcharge: "200", // gross 5500 / 1000 = 5.5
        delivery_date: "2026-07-20",
      }),
    );
  loads.push(
    mkLoad({
      agent_id: "a4",
      origin_city: "Pittsburgh",
      origin_state: "PA",
      linehaul: "4800",
      fuel_surcharge: "200", // gross 5000 / 1000 = 5.0
      delivery_date: "2026-06-20",
    }),
  );
  return { agents, loads };
};

describe("haversineMiles", () => {
  it("Akron → Macedonia is ~16 mi", () => {
    const d = haversineMiles(COORDS.get(cityKey("Macedonia", "OH"))!, COORDS.get(cityKey("Akron", "OH"))!);
    expect(d).toBeGreaterThan(13);
    expect(d).toBeLessThan(19);
  });
  it("is zero for the same point", () => {
    const p = { lat: 41.31, lng: -81.5 };
    expect(haversineMiles(p, p)).toBeCloseTo(0, 6);
  });
});

describe("emptyNextAnchor", () => {
  it("follows the committed chain to the furthest-out booked/in-transit destination", () => {
    const { loads } = buildWorld();
    const a = emptyNextAnchor(loads);
    expect(a).toEqual({ city: "Macedonia", state: "OH", source: "committed" });
  });

  it("falls back to the last delivered destination when nothing is committed", () => {
    const loads = [
      mkLoad({ load_status: "delivered", destination_city: "Reno", destination_state: "NV", delivery_date: "2026-08-01" }),
      mkLoad({ load_status: "delivered", destination_city: "Ogden", destination_state: "UT", delivery_date: "2026-08-05" }),
    ];
    expect(emptyNextAnchor(loads)).toEqual({ city: "Ogden", state: "UT", source: "last-delivered" });
  });

  it("returns null with no usable loads", () => {
    expect(emptyNextAnchor([])).toBeNull();
  });
});

describe("buildForemanBoard — ranking", () => {
  it("balanced favors the deepest tie near the drop over a farther, thinner, higher-rate agent", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { mode: "balanced", now: NOW });
    expect(board.anchor).toEqual({ city: "Macedonia", state: "OH", source: "committed" });
    expect(board.rankings[0].agentId).toBe("a1"); // Summit: 5 loads, ~16 mi
    // Buckeye (a2) pays most but is 1 load + far → not the top call in balanced.
    const a2Rank = board.rankings.findIndex((r) => r.agentId === "a2");
    expect(a2Rank).toBeGreaterThan(0);
  });

  it("best-rate surfaces the highest raw $/mi agent", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { mode: "best-rate", now: NOW });
    expect(board.rankings[0].agentId).toBe("a2"); // rpm 8.0
    expect(board.rankings[0].rpm).toBeCloseTo(8.0, 5);
  });

  it("closest surfaces the nearest origin", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { mode: "closest", now: NOW });
    expect(board.rankings[0].agentId).toBe("a1"); // Akron ~16 mi
    expect(board.rankings[0].distanceMiles).toBeLessThan(19);
  });

  it("computes straight-line distance to each agent's nearest origin", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { now: NOW });
    const byId = Object.fromEntries(board.rankings.map((r) => [r.agentId, r]));
    expect(byId.a1.distanceMiles!).toBeLessThan(19); // Akron
    expect(byId.a2.distanceMiles!).toBeGreaterThan(110); // Columbus ~122
    expect(byId.a4.distanceMiles!).toBeGreaterThan(85); // Pittsburgh ~99
    expect(board.coverage).toEqual({ withCoords: 4, total: 4 });
  });

  it("flags thin agents (< 2 delivered) as New", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { now: NOW });
    const byId = Object.fromEntries(board.rankings.map((r) => [r.agentId, r]));
    expect(byId.a1.isNew).toBe(false); // 5
    expect(byId.a3.isNew).toBe(false); // 2
    expect(byId.a2.isNew).toBe(true); // 1
    expect(byId.a4.isNew).toBe(true); // 1
  });
});

describe("buildForemanBoard — direct customers rank above spot", () => {
  it("a far direct agent (repeat shipper) outranks a closer spot agent", () => {
    seq = 0;
    const agents = [mkAgent("dir", "Direct"), mkAgent("spt", "Spot")];
    const loads: Load[] = [
      // spot's booked load sets the anchor (Macedonia OH); spot is close (Akron).
      mkLoad({ agent_id: "spt", load_status: "booked", origin_city: "Akron", origin_state: "OH", destination_city: "Macedonia", destination_state: "OH", pickup_date: "2026-08-17", delivery_date: "2026-08-19" }),
      mkLoad({ agent_id: "spt", shipper_name: "OneOff", origin_city: "Akron", origin_state: "OH", delivery_date: "2026-08-03" }),
      // direct: same shipper twice, but FAR (Columbus ~122 mi).
      mkLoad({ agent_id: "dir", shipper_name: "Acme", origin_city: "Columbus", origin_state: "OH", delivery_date: "2026-08-01" }),
      mkLoad({ agent_id: "dir", shipper_name: "Acme", origin_city: "Columbus", origin_state: "OH", delivery_date: "2026-08-05" }),
    ];
    const board = buildForemanBoard(loads, agents, COORDS, { now: NOW });
    const ids = board.rankings.map((r) => r.agentId);
    expect(ids.indexOf("dir")).toBeLessThan(ids.indexOf("spt"));
    expect(board.rankings.find((r) => r.agentId === "dir")?.bucket).toBe("direct");
    expect(board.rankings.find((r) => r.agentId === "spt")?.bucket).toBe("spot");
  });
});

describe("buildForemanBoard — rate benchmark (per-type median, loaded basis)", () => {
  it("benchmarks each agent against your realized median gross/loaded for that type", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { now: NOW });
    const byId = Object.fromEntries(board.rankings.map((r) => [r.agentId, r]));
    // your standard loads: 5×6.0, 2×5.5, 1×5.0 → median 6.0; a1 pays 6.0 → delta ~0
    expect(byId.a1.loadType).toBe("standard flatbed");
    expect(byId.a1.benchmark).toBeCloseTo(6.0, 5);
    expect(byId.a1.rateDelta).toBeCloseTo(0, 5);
    // a2 judged on oversize; the only oversize load is its own 8.0 → median 8.0
    expect(byId.a2.loadType).toBe("oversize");
    expect(byId.a2.benchmark).toBeCloseTo(8.0, 5);
    expect(byId.a2.rpm).toBeCloseTo(8.0, 5);
  });
});

describe("buildForemanBoard — membership", () => {
  it("filters to agents who bring that type, judged on it", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, COORDS, { focus: "oversize", now: NOW });
    expect(board.rankings).toHaveLength(1);
    expect(board.rankings[0].agentId).toBe("a2");
    expect(board.rankings[0].loadType).toBe("oversize");
  });

  it("excludes roster agents you've never booked", () => {
    const { agents, loads } = buildWorld();
    const stranger = mkAgent("a9", "Stranger"); // on the roster, zero loads
    const board = buildForemanBoard(loads, [...agents, stranger], COORDS, { now: NOW });
    expect(board.rankings.find((r) => r.agentId === "a9")).toBeUndefined();
  });

  it("excludes an agent whose only load is cancelled", () => {
    const { agents, loads } = buildWorld();
    const cancelledOnly = mkAgent("a8", "Ghost");
    loads.push(mkLoad({ agent_id: "a8", load_status: "cancelled", origin_city: "Akron", origin_state: "OH" }));
    const board = buildForemanBoard(loads, [...agents, cancelledOnly], COORDS, { now: NOW });
    expect(board.rankings.find((r) => r.agentId === "a8")).toBeUndefined();
  });

  it("returns no rankings for a focus type you've never hauled", () => {
    const { agents, loads } = buildWorld(); // no heavy-haul loads
    const board = buildForemanBoard(loads, agents, COORDS, { focus: "heavy haul", now: NOW });
    expect(board.rankings).toHaveLength(0);
    expect(board.anchor).not.toBeNull();
  });
});

describe("buildForemanBoard — region fallback (no coords)", () => {
  it("still ranks by region + relationship, marking region fallback", () => {
    const { agents, loads } = buildWorld();
    const board = buildForemanBoard(loads, agents, new Map(), { mode: "balanced", now: NOW });
    expect(board.anchorResolved).toBe(false);
    expect(board.coverage.withCoords).toBe(0);
    for (const r of board.rankings) {
      expect(r.distanceMiles).toBeNull();
      expect(r.regionFallback).toBe(true);
    }
    // relationship still carries balanced → Summit (5 loads, same region) on top
    expect(board.rankings[0].agentId).toBe("a1");
    // origin still surfaced for the label even without coordinates
    expect(board.rankings[0].nearestOrigin).not.toBeNull();
  });
});
