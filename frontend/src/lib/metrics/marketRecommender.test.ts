import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Market } from "@/types/market";
import { cityKey, type CoordMap } from "./foreman";
import { recommendMarket } from "./marketRecommender";

// --- fixtures --------------------------------------------------------------
const mkMarket = (market_id: string, market_name: string): Market => ({
  market_id,
  market_name,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const MARKETS: Market[] = [
  mkMarket("m-atl", "Atlanta Market"),
  mkMarket("m-dal", "Dallas Market"),
  mkMarket("m-chi", "Chicago Market"),
];

let seq = 0;
const mkLoad = (o: Partial<Load>): Load => ({
  load_id: `L${seq++}`,
  load_number: "N",
  load_type: "flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "B",
  agent_id: "a",
  agent: "A",
  agent_email: null,
  pickup_date: "2026-05-01",
  origin_market_id: "m-atl",
  origin_city: "Atlanta",
  origin_state: "GA",
  origin_market: "Atlanta Market",
  destination_market_id: "m-dal",
  destination_city: "Dallas",
  destination_state: "TX",
  delivery_market: "Dallas Market",
  deadhead_miles: 0,
  loaded_miles: 100,
  linehaul: "1000",
  fuel_surcharge: "0",
  total_accessorials: "0",
  commodity: null,
  payment_status: "paid",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  ...o,
});

// Milner GA ~44 mi S of Atlanta; Chattanooga ~106 mi N (out of range).
const COORDS: CoordMap = new Map([
  [cityKey("Atlanta", "GA"), { lat: 33.749, lng: -84.388 }],
  [cityKey("Milner", "GA"), { lat: 33.117, lng: -84.196 }],
  [cityKey("Dallas", "TX"), { lat: 32.7767, lng: -96.797 }],
  [cityKey("Chattanooga", "TN"), { lat: 35.0456, lng: -85.3097 }],
]);

const base = { loads: [] as Load[], markets: MARKETS, coords: COORDS };

describe("recommendMarket — tier 1 (same facility)", () => {
  it("reuses the market a shipper was seen at before", () => {
    const loads = [mkLoad({ shipper_name: "Acme Steel", origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "acme steel", city: "Somewhere", state: "GA" });
    expect(rec?.tier).toBe(1);
    expect(rec?.market_id).toBe("m-atl");
    expect(rec?.reason).toMatch(/Same shipper/);
  });

  it("matches a receiver for the destination role", () => {
    const loads = [mkLoad({ receiver_name: "Gulf Yard", destination_city: "Dallas", destination_state: "TX", destination_market_id: "m-dal" })];
    const rec = recommendMarket({ ...base, loads, role: "destination", facilityName: "Gulf Yard", city: "Dallas", state: "TX" });
    expect(rec?.tier).toBe(1);
    expect(rec?.market_id).toBe("m-dal");
    expect(rec?.reason).toMatch(/Same receiver/);
  });

  it("matches a facility across roles (a place's market is the same either way)", () => {
    // Seen once as a receiver in Chicago; now appears as a shipper.
    const loads = [mkLoad({ receiver_name: "Lake Co", destination_city: "Chicago", destination_state: "IL", destination_market_id: "m-chi" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "Lake Co", city: "", state: "" });
    expect(rec?.tier).toBe(1);
    expect(rec?.market_id).toBe("m-chi");
  });
});

describe("recommendMarket — multi-plant facility (real: Johns Manville)", () => {
  // Same name, two physical plants in different states/markets.
  const loads = [
    mkLoad({ shipper_name: "Johns Manville", origin_city: "Etowah", origin_state: "GA", origin_market_id: "m-atl" }),
    mkLoad({ shipper_name: "Johns Manville", origin_city: "Waco", origin_state: "TX", origin_market_id: "m-dal" }),
  ];

  it("picks the plant in the entered state (GA)", () => {
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "Johns Manville", city: "Etowah", state: "GA" });
    expect(rec?.tier).toBe(1);
    expect(rec?.market_id).toBe("m-atl");
  });

  it("picks the other plant for the other state (TX)", () => {
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "Johns Manville", city: "Waco", state: "TX" });
    expect(rec?.tier).toBe(1);
    expect(rec?.market_id).toBe("m-dal");
  });

  it("suppresses the facility guess when ambiguous and no state entered", () => {
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "Johns Manville", city: "", state: "" });
    expect(rec).toBeNull();
  });
});

describe("recommendMarket — tier 2 (same city)", () => {
  it("reuses the market for a city seen before, no facility match", () => {
    const loads = [mkLoad({ shipper_name: "Other Co", origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "Brand New Shipper", city: "Atlanta", state: "GA" });
    expect(rec?.tier).toBe(2);
    expect(rec?.market_id).toBe("m-atl");
    expect(rec?.reason).toMatch(/Same city/);
  });

  it("is case/whitespace insensitive on the city match", () => {
    const loads = [mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "  atlanta ", state: "ga" });
    expect(rec?.tier).toBe(2);
    expect(rec?.market_id).toBe("m-atl");
  });
});

describe("recommendMarket — tier 3 (nearest mapped city ≤75 mi)", () => {
  it("recommends a mapped city's market when within radius", () => {
    const loads = [mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "Milner", state: "GA" });
    expect(rec?.tier).toBe(3);
    expect(rec?.market_id).toBe("m-atl");
    expect(rec?.distanceMi).toBeGreaterThan(0);
    expect(rec?.distanceMi).toBeLessThan(75);
    expect(rec?.reason).toMatch(/Nearest mapped city · Atlanta, GA/);
  });

  it("returns null when the nearest mapped city is beyond 75 mi", () => {
    const loads = [mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    // Chattanooga is ~106 mi from Atlanta -> out of range; no other signal.
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "Chattanooga", state: "TN" });
    expect(rec).toBeNull();
  });

  it("returns null for tier 3 when the entered city has no coords", () => {
    const loads = [mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "Nowhereville", state: "GA" });
    expect(rec).toBeNull();
  });
});

describe("recommendMarket — precedence & edge cases", () => {
  it("tier 1 wins over an also-matching tier 2", () => {
    const loads = [mkLoad({ shipper_name: "Acme", origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", facilityName: "Acme", city: "Atlanta", state: "GA" });
    expect(rec?.tier).toBe(1);
  });

  it("picks the dominant market when a city split across two (most frequent)", () => {
    const loads = [
      mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl", pickup_date: "2026-01-01" }),
      mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl", pickup_date: "2026-02-01" }),
      mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-chi", pickup_date: "2026-03-01" }),
    ];
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "Atlanta", state: "GA" });
    expect(rec?.market_id).toBe("m-atl"); // 2 vs 1, despite m-chi being more recent
  });

  it("breaks a frequency tie by the most recent pickup", () => {
    const loads = [
      mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-atl", pickup_date: "2026-01-01" }),
      mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-chi", pickup_date: "2026-06-01" }),
    ];
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "Atlanta", state: "GA" });
    expect(rec?.market_id).toBe("m-chi"); // tie 1-1, m-chi more recent
  });

  it("skips a market_id that no longer exists in the market list", () => {
    const loads = [mkLoad({ origin_city: "Atlanta", origin_state: "GA", origin_market_id: "m-deleted" })];
    const rec = recommendMarket({ ...base, loads, role: "origin", city: "Atlanta", state: "GA" });
    expect(rec).toBeNull();
  });

  it("returns null with no history", () => {
    expect(recommendMarket({ ...base, loads: [], role: "origin", facilityName: "X", city: "Atlanta", state: "GA" })).toBeNull();
  });

  it("returns null when nothing is entered", () => {
    const loads = [mkLoad({})];
    expect(recommendMarket({ ...base, loads, role: "origin", facilityName: "", city: "", state: "" })).toBeNull();
  });
});
