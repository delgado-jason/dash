import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { AgentScorecard } from "./agentScorecard";
import { cityKey, type CoordMap } from "./foreman";
import { outboundStrength, destinationFactor, theCall } from "./marketFactor";

let seq = 0;
const mk = (originCity: string, originState: string, rpm: number, agent: string): Load =>
  ({
    load_id: `L${seq++}`,
    load_number: "N",
    load_type: "standard flatbed",
    load_status: "delivered",
    broker_id: "b",
    broker: "B",
    agent_id: agent,
    agent: "A",
    agent_email: null,
    pickup_date: "2026-07-01",
    origin_market_id: "m",
    origin_city: originCity,
    origin_state: originState,
    origin_market: originCity,
    destination_market_id: "m2",
    destination_city: "Somewhere",
    destination_state: "XX",
    delivery_market: "Somewhere",
    deadhead_miles: 0,
    loaded_miles: 1000,
    linehaul: String(rpm * 1000), // gross = rpm × 1000 loaded → gross/loaded = rpm
    fuel_surcharge: "0",
    total_accessorials: "0",
    commodity: null,
    payment_status: "paid",
    delivery_date: "2026-07-05",
    created_at: "",
    updated_at: "",
  }) as Load;

// PA strong (4 loads @ $8, 2 agents), AL fair (4 @ $5.8), TX soft (3 @ $4.2),
// MS thin (1 load). Overall outbound median works out to 5.8.
const world = (): Load[] => {
  seq = 0;
  return [
    mk("Bellefonte", "PA", 8.0, "a1"),
    mk("Bellefonte", "PA", 8.0, "a2"),
    mk("Reading", "PA", 8.0, "a1"),
    mk("Reading", "PA", 8.0, "a2"),
    mk("Dothan", "AL", 5.8, "a3"),
    mk("Dothan", "AL", 5.8, "a4"),
    mk("Mobile", "AL", 5.8, "a3"),
    mk("Mobile", "AL", 5.8, "a4"),
    mk("Laredo", "TX", 4.2, "a5"),
    mk("Laredo", "TX", 4.2, "a5"),
    mk("Dallas", "TX", 4.2, "a6"),
    mk("Iuka", "MS", 7.0, "a7"),
  ];
};

const COORDS: CoordMap = new Map([
  [cityKey("Houston", "TX"), { lat: 29.76, lng: -95.37 }],
  [cityKey("Bellefonte", "PA"), { lat: 40.91, lng: -77.78 }],
  [cityKey("Reading", "PA"), { lat: 40.34, lng: -75.93 }],
]);

describe("outboundStrength", () => {
  it("grades each origin market by your own outbound rate + volume", () => {
    const s = outboundStrength(world());
    expect(s.get("PA")).toMatchObject({ grade: "strong", loadsOut: 4, medianRpm: 8.0, agents: 2 });
    expect(s.get("AL")).toMatchObject({ grade: "fair", loadsOut: 4, medianRpm: 5.8 });
    expect(s.get("TX")).toMatchObject({ grade: "soft", loadsOut: 3, medianRpm: 4.2 });
    expect(s.get("MS")).toMatchObject({ grade: "thin", loadsOut: 1 }); // a single load → thin
  });
});

describe("destinationFactor", () => {
  it("flags a soft delivery market + names your strong markets + nearest strong freight", () => {
    const d = destinationFactor(world(), { city: "Houston", state: "TX" }, COORDS);
    expect(d.market?.grade).toBe("soft");
    expect(d.strongMarkets.map((m) => m.state)).toEqual(["PA"]);
    // Houston → Reading, PA (~1300 mi) is the nearest strong origin with a coord
    expect(d.nearestStrong?.state).toBe("PA");
    expect(d.nearestStrong!.miles).toBeGreaterThan(1100);
  });

  it("returns a null market for a state you've never loaded out of", () => {
    const d = destinationFactor(world(), { city: "Miami", state: "FL" }, COORDS);
    expect(d.market).toBeNull();
    expect(d.strongMarkets.length).toBe(1);
  });

  it("omits nearest-strong when the delivery city has no trusted coordinate", () => {
    const d = destinationFactor(world(), { city: "Nowhere", state: "TX" }, new Map());
    expect(d.market?.grade).toBe("soft");
    expect(d.nearestStrong).toBeNull();
  });
});

describe("theCall", () => {
  const keeper: AgentScorecard = {
    agentId: "a1",
    loadCount: 6,
    revenue: 0,
    medianRpm: 8,
    trend: null,
    lastWorked: null,
    daysSince: 10,
    moneyLostLoads: 0,
    collectedLoads: 0,
    collectRate: null,
    specialty: { tag: "standard", oversizeShare: 0, specialtyShare: 0, oversizeCount: 0 },
    autoClass: "spot",
    repeatCustomers: [],
    tier: "solid",
    ratingFlag: null,
  };
  const softDest = destinationFactor(world(), { city: "Houston", state: "TX" }, COORDS);
  const strongDest = destinationFactor(world(), { city: "Reading", state: "PA" }, COORDS);

  it("null when there's no verdict", () => {
    expect(theCall(null, softDest, keeper, false)).toBeNull();
  });

  it("a marginal load into a soft market with a keeper leans on the relationship", () => {
    const c = theCall("meh", softDest, keeper, false)!;
    expect(c.tone).toBe("caution");
    expect(c.text).toMatch(/keeper/i);
    expect(c.text).toMatch(/SOLID/);
  });

  it("a good load into a strong market says take it", () => {
    const c = theCall("take", strongDest, null, false)!;
    expect(c.tone).toBe("good");
    expect(c.text).toMatch(/strong outbound market/i);
    expect(c.text).toMatch(/take it/i);
  });

  it("a money-loser says pass", () => {
    const c = theCall("pass", softDest, null, false)!;
    expect(c.tone).toBe("bad");
    expect(c.text).toMatch(/loses money/i);
  });

  it("a good load into a soft market says take-but-reposition", () => {
    const c = theCall("take", softDest, null, false)!;
    expect(c.tone).toBe("caution");
    expect(c.text).toMatch(/reposition/i);
  });
});
