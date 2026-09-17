import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import { getRegion, getStateName } from "@/lib/constants/states";
import {
  getRegionRollup,
  getLanesSummary,
  getRecentLoads,
  getAreaMapData,
  levelForWindow,
} from "./lanes";

const makeLoad = (over: Partial<Load>): Load => ({
  load_id: "L",
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  agency_id: "b",
  agency_code: "B",
  posting_code: null,
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
    expect(summary.topRpmLane?.medianRpm).toBeCloseTo(3.0, 5);
    expect(summary.highestVolumeLane?.loadCount).toBe(3);
    expect(summary.bestOriginMarket?.market).toBe("Atlanta");
  });

  it("returns nulls for empty input", () => {
    const summary = getLanesSummary([]);
    expect(summary.topRpmLane).toBeNull();
    expect(summary.highestVolumeLane).toBeNull();
    expect(summary.bestOriginMarket).toBeNull();
  });

  it("ranks lanes on the typical (median) rate, not a blended fluke", () => {
    const loads = [
      // Atlanta → Dallas: 3 steady loads at $2.00/mi
      makeLoad({ linehaul: "2000", loaded_miles: 1000 }),
      makeLoad({ linehaul: "2000", loaded_miles: 1000 }),
      makeLoad({ linehaul: "2000", loaded_miles: 1000 }),
      // Atlanta → Miami: two $2.10 loads + one short oversize fluke at $6/mi.
      // Blended (revenue-weighted) tops $2.10; median stays $2.10.
      makeLoad({ delivery_market: "Miami", linehaul: "2100", loaded_miles: 1000 }),
      makeLoad({ delivery_market: "Miami", linehaul: "2100", loaded_miles: 1000 }),
      makeLoad({ delivery_market: "Miami", linehaul: "1200", loaded_miles: 200 }),
    ];
    const summary = getLanesSummary(loads);
    // Miami's blended rate is inflated by the fluke, but its typical load is
    // $2.10 — so Dallas ($2.00) shouldn't lose the crown to a rate Miami can't
    // repeat. Median ranking keeps Miami on top only on its typical strength.
    expect(summary.topRpmLane?.destination).toBe("Miami");
    expect(summary.topRpmLane?.medianRpm).toBeCloseTo(2.1, 5);
    expect(summary.topRpmLane?.avgRpm ?? 0).toBeGreaterThan(2.2); // blended is pulled up
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

  it("getAreaMapData windows the loads (no separate footprint)", () => {
    const loads = [
      makeLoad({ origin_state: "GA", delivery_date: d10, linehaul: "3000", loaded_miles: 1000 }),
      makeLoad({ origin_state: "GA", delivery_date: d200, linehaul: "3000", loaded_miles: 1000 }),
      makeLoad({ origin_state: "TX", origin_market: "Dallas", delivery_date: d200, linehaul: "2000", loaded_miles: 1000 }),
    ];
    // 90-day window: only GA's recent load counts; TX (200d ago) drops out entirely.
    const data = getAreaMapData(loads, 90, "state");
    expect(data["Georgia"].loadCount).toBe(1);
    expect(data["Georgia"].medianRpm).toBeCloseTo(3.0, 5);
    expect(data["Texas"]).toBeUndefined();
  });
});

describe("granularity map (levelForWindow / getAreaMapData)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const recent = "2026-06-28"; // 10d (in 30/60/90)
  const mid = "2026-05-20"; // ~49d (in 60/90, out of 30)
  const old = "2026-04-25"; // ~74d (in 90 only)

  const loads = [
    makeLoad({ origin_state: "GA", origin_market: "Atlanta", delivery_market: "Dallas", delivery_date: recent, linehaul: "2000", loaded_miles: 1000 }), // Southeast/South, 2.0
    makeLoad({ origin_state: "TX", origin_market: "Dallas", delivery_market: "Atlanta", delivery_date: recent, linehaul: "3000", loaded_miles: 1000 }), // Gulf/South, 3.0
    makeLoad({ origin_state: "IL", origin_market: "Chicago", delivery_market: "Miami", delivery_date: mid, linehaul: "2500", loaded_miles: 1000 }), // Midwest, 2.5
    makeLoad({ origin_state: "CA", origin_market: "LA", delivery_market: "Reno", delivery_date: old, linehaul: "4000", loaded_miles: 1000 }), // Pacific/West, 4.0
    makeLoad({ origin_state: "GA", delivery_date: recent, load_status: "booked" }), // not delivered → excluded
  ];

  it("maps each window to a granularity level", () => {
    expect(levelForWindow(30)).toBe("macro");
    expect(levelForWindow(60)).toBe("region");
    expect(levelForWindow(90)).toBe("state");
  });

  it("30d → macro-regions, over the 30-day window", () => {
    const d = getAreaMapData(loads, 30, "macro");
    // only the two 10-day-old loads are in-window; both roll up to South
    expect(Object.keys(d)).toEqual(["South"]);
    expect(d["South"].loadCount).toBe(2);
    expect([...d["South"].members].sort()).toEqual(["Georgia", "Texas"]);
    expect(d["South"].avgRpm).toBeCloseTo(2.5, 5); // (2000+3000)/2000
  });

  it("60d → freight regions (adds the 49-day-old Midwest load)", () => {
    const d = getAreaMapData(loads, 60, "region");
    expect(new Set(Object.keys(d))).toEqual(new Set(["Southeast", "Gulf", "Midwest"]));
    expect(d["Midwest"].members).toEqual(["Illinois"]);
    expect(d["Southeast"].loadCount).toBe(1);
  });

  it("90d → states; members are origin markets; excludes non-delivered", () => {
    const d = getAreaMapData(loads, 90, "state");
    expect(new Set(Object.keys(d))).toEqual(
      new Set(["Georgia", "Texas", "Illinois", "California"]),
    );
    expect(d["Georgia"].loadCount).toBe(1); // booked one excluded
    expect(d["Georgia"].members).toEqual(["Atlanta"]); // markets, not states
  });

  it("skips unrecognized origin states", () => {
    const d = getAreaMapData([makeLoad({ origin_state: "ZZ", delivery_date: recent })], 90, "state");
    expect(Object.keys(d)).toHaveLength(0);
  });
});

describe("perDay on the region / market / lane rollup", () => {
  it("is WEIGHTED at every level — Σgross ÷ Σdays, never a mean of rates", () => {
    const [region] = getRegionRollup([
      // GA → TX, $2,300 over two days (Jun 1 → 2)
      makeLoad({
        linehaul: "2300",
        pickup_date: "2026-06-01",
        delivery_date: "2026-06-02",
      }),
      // GA → TX, $5,220 over five days (Jun 5 → 9)
      makeLoad({
        linehaul: "5220",
        pickup_date: "2026-06-05",
        delivery_date: "2026-06-09",
      }),
    ]);
    const weighted = 7520 / 7; // $1,074 — not the $1,097 mean
    expect(region.perDay.perDay).toBeCloseTo(weighted, 5);
    expect(region.markets[0].perDay.perDay).toBeCloseTo(weighted, 5);
    expect(region.markets[0].lanes[0].perDay.perDay).toBeCloseTo(weighted, 5);
    // …and the totals it was divided out of ride along, so the table can gate
    // its colour on the loads that actually fed the figure.
    expect(region.perDay).toEqual({ perDay: weighted, days: 7, gross: 7520, loads: 2 });
  });

  it("counts gross — linehaul plus the fuel surcharge and accessorials", () => {
    const [region] = getRegionRollup([
      makeLoad({
        linehaul: "1000",
        fuel_surcharge: "300",
        total_accessorials: "200",
        pickup_date: "2026-06-01",
        delivery_date: "2026-06-03", // 3 days
      }),
    ]);
    expect(region.perDay.perDay).toBeCloseTo(1500 / 3, 5);
  });

  it("leaves out a load with no delivery date, and is null when none has one", () => {
    const [region] = getRegionRollup([
      makeLoad({ linehaul: "3000", pickup_date: "2026-06-01", delivery_date: "2026-06-03" }),
      makeLoad({ linehaul: "9999", delivery_date: null }),
    ]);
    expect(region.perDay.perDay).toBeCloseTo(1000, 5);
    // Two loads in the group, ONE behind the figure — the number the colour
    // has to gate on.
    expect(region.loadCount).toBe(2);
    expect(region.perDay.loads).toBe(1);

    const [bare] = getRegionRollup([makeLoad({ delivery_date: null })]);
    expect(bare.perDay.perDay).toBeNull();
    expect(bare.perDay.loads).toBe(0);
  });
});
