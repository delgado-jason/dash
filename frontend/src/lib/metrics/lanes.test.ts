import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import { getRegion, getStateName } from "@/lib/constants/states";
import {
  getRegionRollup,
  getStateLoadMap,
  getLanesSummary,
  getRecentLoads,
  getStateMapData,
} from "./lanes";

const makeLoad = (over: Partial<Load>): Load => ({
  load_id: "L",
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "B",
  agent_id: "a",
  agent: "A",
  agent_email: null,
  pickup_date: "2026-06-01",
  origin_market_id: "m",
  origin_city: "X",
  origin_state: "GA",
  origin_market: "Atlanta",
  receiver_name: null,
  delivery_date: "2026-06-05",
  destination_market_id: "m2",
  destination_city: "Y",
  destination_state: "TX",
  delivery_market: "Dallas",
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "1000",
  fuel_surcharge: "0",
  total_accessorials: "0",
  commodity: null,
  odometer_start: null,
  odometer_end: null,
  payment_status: "unpaid",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("getRegion / getStateName", () => {
  it("maps states to trucking regions (9-division boundaries)", () => {
    expect(getRegion("GA")).toBe("Southeast");
    expect(getRegion("TX")).toBe("Gulf");
    expect(getRegion("AL")).toBe("Mid-South");
    expect(getRegion("IL")).toBe("Midwest");
    expect(getRegion("PA")).toBe("Northeast");
    expect(getStateName("ga")).toBe("Georgia"); // case-insensitive
  });

  it("returns Unknown / null for blank or unrecognized states", () => {
    expect(getRegion("")).toBe("Unknown");
    expect(getRegion("ZZ")).toBe("Unknown");
    expect(getStateName(null)).toBeNull();
  });
});

describe("getRegionRollup", () => {
  const loads = [
    // Southeast / Atlanta → Dallas: gross 1300, loaded 1000 (x2)
    makeLoad({ linehaul: "1000", fuel_surcharge: "300", loaded_miles: 1000 }),
    makeLoad({ linehaul: "1000", fuel_surcharge: "300", loaded_miles: 1000 }),
    // Southeast / Atlanta → Houston: gross 1000, loaded 500 → 2.0
    makeLoad({ delivery_market: "Houston", linehaul: "1000", loaded_miles: 500 }),
    // Gulf / Dallas → Atlanta: gross 900, loaded 300 → 3.0
    makeLoad({
      origin_state: "TX",
      origin_market: "Dallas",
      delivery_market: "Atlanta",
      linehaul: "900",
      loaded_miles: 300,
    }),
    // cancelled — must be excluded
    makeLoad({ load_status: "cancelled", loaded_miles: 1000 }),
  ];

  it("nests region → market → lane with counts and RPM, delivered only", () => {
    const rollup = getRegionRollup(loads);
    // two regions, sorted by load count desc → Southeast (3) then Gulf (1)
    expect(rollup.map((r) => r.region)).toEqual(["Southeast", "Gulf"]);

    const se = rollup[0];
    expect(se.loadCount).toBe(3); // cancelled excluded
    // gross 1300+1300+1000 = 3600 over 1000+1000+500 = 2500 → 1.44
    expect(se.avgRpm).toBeCloseTo(3600 / 2500, 5);

    const atlanta = se.markets[0];
    expect(atlanta.market).toBe("Atlanta");
    // lanes sorted by RPM desc → Houston (2.0) before Dallas (1.30)
    expect(atlanta.lanes.map((l) => l.destination)).toEqual([
      "Houston",
      "Dallas",
    ]);
    expect(atlanta.lanes[1].avgRpm).toBeCloseTo(2600 / 2000, 5); // Dallas 1.30
    expect(atlanta.lanes[1].loadCount).toBe(2);

    expect(rollup[1].region).toBe("Gulf");
    expect(rollup[1].avgRpm).toBeCloseTo(3.0, 5);
  });

  it("returns an empty array for no loads", () => {
    expect(getRegionRollup([])).toEqual([]);
  });
});

describe("getStateLoadMap", () => {
  it("keys by full state name and skips unrecognized states", () => {
    const loads = [
      makeLoad({ origin_state: "GA" }),
      makeLoad({ origin_state: "GA" }),
      makeLoad({ origin_state: "TX", origin_market: "Dallas" }),
      makeLoad({ origin_state: "ZZ" }), // unknown → skipped
    ];
    const map = getStateLoadMap(loads);
    expect(map["Georgia"].loadCount).toBe(2);
    expect(map["Georgia"].markets).toEqual(["Atlanta"]);
    expect(map["Texas"].loadCount).toBe(1);
    expect(Object.keys(map)).not.toContain("");
    expect(Object.keys(map).length).toBe(2);
  });
});

describe("getLanesSummary", () => {
  it("requires >= 3 loads for the top RPM lane (ignores lucky singletons)", () => {
    const loads = [
      // Atlanta → Dallas: 3 loads @ RPM 3.0
      makeLoad({ linehaul: "3000", loaded_miles: 1000 }),
      makeLoad({ linehaul: "3000", loaded_miles: 1000 }),
      makeLoad({ linehaul: "3000", loaded_miles: 1000 }),
      // Chicago → Miami: 1 load @ RPM 5.0 (higher, but too few loads)
      makeLoad({
        origin_state: "IL",
        origin_market: "Chicago",
        delivery_market: "Miami",
        linehaul: "5000",
        loaded_miles: 1000,
      }),
    ];
    const summary = getLanesSummary(loads);
    expect(summary.topRpmLane?.destination).toBe("Dallas");
    expect(summary.topRpmLane?.avgRpm).toBeCloseTo(3.0, 5);
    expect(summary.highestVolumeLane?.loadCount).toBe(3);
    expect(summary.bestOriginMarket?.market).toBe("Atlanta");
  });

  it("returns nulls for empty input", () => {
    const summary = getLanesSummary([]);
    expect(summary.topRpmLane).toBeNull();
    expect(summary.highestVolumeLane).toBeNull();
    expect(summary.bestOriginMarket).toBeNull();
  });
});

describe("recency windowing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const d10 = "2026-06-28"; // 10 days ago
  const d70 = "2026-04-29"; // ~70 days ago
  const d200 = "2025-12-20"; // ~200 days ago
  const d400 = "2025-06-03"; // ~400 days ago

  it("getRecentLoads keeps only loads inside the window", () => {
    const loads = [
      makeLoad({ delivery_date: d10 }),
      makeLoad({ delivery_date: d70 }),
      makeLoad({ delivery_date: d200 }),
      makeLoad({ delivery_date: d400 }),
    ];
    expect(getRecentLoads(loads, 30)).toHaveLength(1);
    expect(getRecentLoads(loads, 90)).toHaveLength(2);
    expect(getRecentLoads(loads, 365)).toHaveLength(3);
  });

  it("getStateMapData shades by footprint but rates by the RPM window", () => {
    const loads = [
      // Georgia: one recent load (in the 90-day window) + one old (footprint only)
      makeLoad({
        origin_state: "GA",
        delivery_date: d10,
        linehaul: "3000",
        loaded_miles: 1000,
      }),
      makeLoad({
        origin_state: "GA",
        delivery_date: d200,
        linehaul: "3000",
        loaded_miles: 1000,
      }),
      // Texas: only an old load — shaded (footprint) but no recent rate
      makeLoad({
        origin_state: "TX",
        origin_market: "Dallas",
        delivery_date: d200,
        linehaul: "2000",
        loaded_miles: 1000,
      }),
    ];
    const data = getStateMapData(loads, 90, 365);

    expect(data["Georgia"].loadCount).toBe(2); // footprint = past year
    expect(data["Georgia"].avgRpm).toBeCloseTo(3.0, 5); // only the recent load
    expect(data["Texas"].loadCount).toBe(1); // shaded (ran there this year)
    expect(data["Texas"].avgRpm).toBeNull(); // but nothing in the 90-day window
  });
});
