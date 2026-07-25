import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import {
  getRevenueMTD,
  getRevenueLastMonth,
  getRevenueYTD,
  getMonthlyDeadhead,
  getMonthlyRevenue,
  getMonthlyRPM,
  getOutstandingLoads,
  getLoadsMonthly,
  getTopAgentsByRevenue,
  getUpcomingLoads,
  getRecentDeliveredLoads,
  getOutstandingSummary,
  getDeadheadTrend,
  getDetentionOwed,
  getAgentGrossTable,
} from "./dashboard";

// ---- typed factories: override only the fields a test cares about ----
const baseLoad: Load = {
  load_id: "L",
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "B",
  agent_id: "a",
  agent: "A",
  agent_email: null,
  pickup_date: "2026-06-01T04:00:00.000Z",
  origin_market_id: "m",
  origin_city: "X",
  origin_state: "TX",
  origin_market: "M",
  destination_market_id: "m2",
  destination_city: "Y",
  destination_state: "TN",
  delivery_market: "M2",
  delivery_date: "2026-06-10T04:00:00.000Z",
  deadhead_miles: 0,
  loaded_miles: 0,
  linehaul: "0",
  fuel_surcharge: "0",
  total_accessorials: "0",
  commodity: null,
  odometer_start: null,
  odometer_end: null,
  payment_status: "unpaid",
  created_at: "",
  updated_at: "",
};

const baseTrip: Trip = {
  trip_id: "T",
  trip_number: 1,
  trip_purpose: "repositioning",
  truck_id: null,
  unit_number: null,
  driver_id: null,
  driver_name: null,
  trip_type: "deadhead",
  trip_source: "user",
  trip_date: "2026-06-10",
  status: "completed",
  odometer_start: null,
  odometer_end: null,
  is_estimated: true,
  created_at: "",
  updated_at: "",
};

const makeLoad = (over: Partial<Load>): Load => ({ ...baseLoad, ...over });
const makeTrip = (over: Partial<Trip>): Trip => ({ ...baseTrip, ...over });

// Freeze the clock before each test, restore the real clock after each
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- GET MONTHLY DEADHEAD TEST ---- (clock frozen to 2026-06-22 → June vs May)
describe("getMonthlyDeadhead", () => {
  it("computes this month and last month, counting loads AND trips", () => {
    const loads = [
      // June: window 500, loaded 400 → 100 empty
      makeLoad({
        delivery_date: "2026-06-10T04:00:00.000Z",
        odometer_start: 100000,
        odometer_end: 100500,
        loaded_miles: 400,
      }),
      // May: window 400, loaded 400 → 0 empty
      makeLoad({
        delivery_date: "2026-05-12T04:00:00.000Z",
        odometer_start: 90000,
        odometer_end: 90400,
        loaded_miles: 400,
      }),
    ];
    const trips = [
      // June trip: window 100, all empty
      makeTrip({
        trip_date: "2026-06-15",
        odometer_start: 100500,
        odometer_end: 100600,
      }),
      // May trip: window 100, all empty
      makeTrip({
        trip_date: "2026-05-20",
        odometer_start: 90400,
        odometer_end: 90500,
      }),
    ];

    const result = getMonthlyDeadhead(loads, trips);
    // June: total 600, loaded 400 → 200/600
    expect(result.thisMonth).toBeCloseTo(200 / 600, 5);
    // May: total 500, loaded 400 → 0.2
    expect(result.lastMonth).toBeCloseTo(0.2, 5);
  });

  it("returns null for months with no qualifying miles", () => {
    const result = getMonthlyDeadhead([], []);
    expect(result.thisMonth).toBeNull();
    expect(result.lastMonth).toBeNull();
  });

  it("counts trips with no loads at all as 100% empty", () => {
    const trips = [
      makeTrip({
        trip_date: "2026-06-15",
        odometer_start: 100000,
        odometer_end: 100200,
      }),
    ];
    const result = getMonthlyDeadhead([], trips);
    expect(result.thisMonth).toBe(1);
  });

  it("includes delivered-but-unpaid loads; excludes cancelled and tonu", () => {
    const loads = [
      makeLoad({
        payment_status: "unpaid",
        odometer_start: 100000,
        odometer_end: 100500,
        loaded_miles: 400,
      }),
      makeLoad({
        load_status: "cancelled",
        odometer_start: 100500,
        odometer_end: 101000,
      }),
      makeLoad({
        load_status: "tonu",
        odometer_start: 101000,
        odometer_end: 101500,
      }),
    ];
    // Only the unpaid delivered load counts: 500 window, 400 loaded → 0.2
    const result = getMonthlyDeadhead(loads, []);
    expect(result.thisMonth).toBeCloseTo(0.2, 5);
  });

  it("excludes trips missing an odometer reading", () => {
    const loads = [
      makeLoad({
        odometer_start: 100000,
        odometer_end: 100500,
        loaded_miles: 400,
      }),
    ];
    const trips = [
      makeTrip({
        trip_date: "2026-06-15",
        odometer_start: 100500,
        odometer_end: null, // incomplete → ignored
      }),
    ];
    const result = getMonthlyDeadhead(loads, trips);
    // trip ignored → load-only: 100/500 = 0.2
    expect(result.thisMonth).toBeCloseTo(0.2, 5);
  });

  it("handles the January → December year rollover for last month", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    const loads = [
      // Dec 2025: window 300, loaded 200 → 100/300
      makeLoad({
        delivery_date: "2025-12-20T05:00:00.000Z",
        odometer_start: 80000,
        odometer_end: 80300,
        loaded_miles: 200,
      }),
    ];
    const result = getMonthlyDeadhead(loads, []);
    expect(result.thisMonth).toBeNull(); // nothing in Jan 2026
    expect(result.lastMonth).toBeCloseTo(100 / 300, 5); // Dec 2025 found
  });
});

// ---- DASHBOARD REDESIGN METRICS ---- (clock frozen to 2026-06-22 → June/May)
describe("getLoadsMonthly", () => {
  it("counts delivered loads this month vs last", () => {
    const loads = [
      makeLoad({
        load_status: "delivered",
        delivery_date: "2026-06-10T04:00:00.000Z",
      }),
      makeLoad({
        load_status: "delivered",
        delivery_date: "2026-06-20T04:00:00.000Z",
      }),
      makeLoad({
        load_status: "delivered",
        delivery_date: "2026-05-15T04:00:00.000Z",
      }),
      makeLoad({
        load_status: "booked", // not delivered → excluded
        delivery_date: "2026-06-05T04:00:00.000Z",
      }),
    ];
    expect(getLoadsMonthly(loads)).toEqual({ thisMonth: 2, lastMonth: 1 });
  });
});

describe("getTopAgentsByRevenue", () => {
  it("ranks by recent revenue; drops one-offs (floor) and stale agents (window)", () => {
    const loads = [
      // Ann: 2 recent loads → qualifies, revenue 1500
      makeLoad({ agent_id: "a1", agent: "Ann", linehaul: "1000", delivery_date: "2026-06-10T04:00:00.000Z" }),
      makeLoad({ agent_id: "a1", agent: "Ann", linehaul: "500", delivery_date: "2026-06-12T04:00:00.000Z" }),
      // Bob: 3 recent loads → qualifies, revenue 1200
      makeLoad({ agent_id: "a2", agent: "Bob", linehaul: "400", delivery_date: "2026-06-01T04:00:00.000Z" }),
      makeLoad({ agent_id: "a2", agent: "Bob", linehaul: "400", delivery_date: "2026-06-05T04:00:00.000Z" }),
      makeLoad({ agent_id: "a2", agent: "Bob", linehaul: "400", delivery_date: "2026-06-08T04:00:00.000Z" }),
      // Cid: one big recent load → excluded by the ≥2 floor
      makeLoad({ agent_id: "a3", agent: "Cid", linehaul: "9999", delivery_date: "2026-06-15T04:00:00.000Z" }),
      // Dot: two loads but ~6 months ago → excluded by the 90-day window
      makeLoad({ agent_id: "a4", agent: "Dot", linehaul: "5000", delivery_date: "2025-12-15T04:00:00.000Z" }),
      makeLoad({ agent_id: "a4", agent: "Dot", linehaul: "5000", delivery_date: "2025-12-20T04:00:00.000Z" }),
    ];
    const top = getTopAgentsByRevenue(loads, 90, 2, 5);
    expect(top.map((a) => a.agent)).toEqual(["Ann", "Bob"]);
    expect(top[0].revenue).toBe(1500);
    expect(top[0].loadCount).toBe(2);
  });

  it("respects the limit", () => {
    const loads = ["a", "b", "c"].flatMap((id) => [
      makeLoad({ agent_id: id, agent: id, delivery_date: "2026-06-10T04:00:00.000Z" }),
      makeLoad({ agent_id: id, agent: id, delivery_date: "2026-06-11T04:00:00.000Z" }),
    ]);
    expect(getTopAgentsByRevenue(loads, 90, 2, 2)).toHaveLength(2);
  });

  it("uses GROSS, not net — an agent isn't penalized for Jason's cut", () => {
    // gross = linehaul + fsc + accessorials = 1250/load; net_revenue (700) must
    // NOT be what's summed.
    const grossLoad = {
      linehaul: "1000",
      fuel_surcharge: "200",
      total_accessorials: "50",
      net_revenue: "700",
    };
    const loads = [
      makeLoad({ agent_id: "g", agent: "Gus", delivery_date: "2026-06-10T04:00:00.000Z", ...grossLoad }),
      makeLoad({ agent_id: "g", agent: "Gus", delivery_date: "2026-06-12T04:00:00.000Z", ...grossLoad }),
    ];
    const top = getTopAgentsByRevenue(loads, 90, 2, 5);
    expect(top[0].revenue).toBe(2500); // 2 × 1250 gross, not 2 × 700 net
  });
});

describe("getAgentGrossTable", () => {
  it("lists every agent with a delivered load, gross + count, gross-sorted", () => {
    const loads = [
      makeLoad({ agent_id: "a1", agent: "Ann", linehaul: "1000", delivery_date: "2026-06-10T04:00:00.000Z" }),
      makeLoad({ agent_id: "a2", agent: "Bob", linehaul: "400", delivery_date: "2026-06-01T04:00:00.000Z" }),
      makeLoad({ agent_id: "a2", agent: "Bob", linehaul: "400", delivery_date: "2026-06-05T04:00:00.000Z" }),
      // booked → excluded (no realized gross yet)
      makeLoad({ agent_id: "a3", agent: "Cid", load_status: "booked", linehaul: "9999" }),
    ];
    const table = getAgentGrossTable(loads);
    expect(table.map((r) => r.agent)).toEqual(["Ann", "Bob"]); // 1000 > 800
    expect(table[1].loadCount).toBe(2);
    expect(table[1].revenue).toBe(800);
  });

  it("returns an empty list when no loads are delivered", () => {
    expect(getAgentGrossTable([])).toEqual([]);
  });
});

describe("getRecentDeliveredLoads", () => {
  it("returns delivered loads newest first with lane and revenue", () => {
    const loads = [
      makeLoad({ load_number: "OLD", delivery_date: "2026-05-01T04:00:00.000Z", linehaul: "100" }),
      makeLoad({ load_number: "NEW", delivery_date: "2026-06-20T04:00:00.000Z", linehaul: "200" }),
      makeLoad({ load_number: "BOOKED", load_status: "booked", delivery_date: "2026-06-25T04:00:00.000Z" }),
    ];
    const recent = getRecentDeliveredLoads(loads, 5);
    expect(recent.map((r) => r.load_number)).toEqual(["NEW", "OLD"]);
    expect(recent[0].revenue).toBe(200);
  });
});

describe("getOutstandingSummary", () => {
  it("totals revenue and reports median + oldest aging", () => {
    const summary = getOutstandingSummary([
      { load_id: "1", load_number: "1", broker: "B", revenue: 1000, daysOutstanding: 10 },
      { load_id: "2", load_number: "2", broker: "B", revenue: 500, daysOutstanding: 20 },
      { load_id: "3", load_number: "3", broker: "B", revenue: 300, daysOutstanding: 61 },
    ]);
    expect(summary.total).toBe(1800);
    expect(summary.medianDaysOutstanding).toBe(20); // not the 30.3 mean the 61 would force
    expect(summary.oldestDaysOutstanding).toBe(61);
  });

  it("returns null aging when there is nothing outstanding", () => {
    expect(getOutstandingSummary([])).toEqual({
      total: 0,
      medianDaysOutstanding: null,
      oldestDaysOutstanding: null,
    });
  });
});

describe("getUpcomingLoads", () => {
  it("returns booked/in-transit soonest pickup first, delivered excluded", () => {
    const loads = [
      makeLoad({ load_number: "B", load_status: "booked", pickup_date: "2026-07-12" }),
      makeLoad({ load_number: "A", load_status: "in_transit", pickup_date: "2026-07-05" }),
      makeLoad({ load_number: "D", load_status: "delivered", pickup_date: "2026-07-01" }),
    ];
    const up = getUpcomingLoads(loads, 5);
    expect(up.map((u) => u.load_number)).toEqual(["A", "B"]);
    expect(up[0].pickup_date).toBe("2026-07-05");
  });
});

// ---- GET REVENUE MTD TEST ----
describe("getRevenueMTD", () => {
  it("returns the total revenue MTD", () => {
    const loads = [
      {
        load_id: "4e519969-9069-4482-9342-dcb60e88115c",
        load_number: "5138745",
        load_type: "standard flatbed",
        load_status: "in_transit",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: null,
        pickup_date: "2026-06-08T04:00:00.000Z",
        origin_city: "Leighton",
        origin_state: "AL",
        origin_market: "Atlanta Market",
        receiver_name: null,
        delivery_date: "2026-06-09T04:00:00.000Z",
        destination_city: "Sussex",
        destination_state: "AL",
        delivery_market: "Charlotte Market",
        deadhead_miles: 200,
        loaded_miles: 1000,
        linehaul: "1000.00",
        fuel_surcharge: "300.00",
        total_accessorials: "0",
        commodity: null,
        weight: null,
        dimensions: null,
        odometer_start: 200000,
        odometer_end: 201000,
        payment_status: "unpaid",
        created_at: "2026-06-09T01:12:22.644Z",
        updated_at: "2026-06-14T23:28:57.856Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000005",
        load_number: "AGJ-6455657",
        load_type: "heavy haul",
        load_status: "delivered",
        broker: "AGJ",
        agent: "Ausra Jaronis",
        shipper_name: "Ohio Heavy Equipment",
        pickup_date: "2026-06-06T04:00:00.000Z",
        origin_city: "West Chester",
        origin_state: "OH",
        origin_market: "Memphis Market",
        receiver_name: "Brandywine Yard",
        delivery_date: "2026-06-08T04:00:00.000Z",
        destination_city: "Brandywine",
        destination_state: "MD",
        delivery_market: "Philadelphia Market",
        deadhead_miles: 30,
        loaded_miles: 440,
        linehaul: "4000.00",
        fuel_surcharge: "720.00",
        total_accessorials: "175.00",
        commodity: "Excavator",
        weight: 78000,
        dimensions: null,
        odometer_start: 314697,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-14T22:58:45.144Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000004",
        load_number: "LLL-9476094",
        load_type: "standard flatbed",
        load_status: "delivered",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: "Troutman Industries",
        pickup_date: "2026-06-03T04:00:00.000Z",
        origin_city: "Troutman",
        origin_state: "NC",
        origin_market: "Charlotte Market",
        receiver_name: "Hebron Logistics",
        delivery_date: "2026-06-04T04:00:00.000Z",
        destination_city: "Hebron",
        destination_state: "OH",
        delivery_market: "Columbus Market",
        deadhead_miles: 150,
        loaded_miles: 610,
        linehaul: "3014.00",
        fuel_surcharge: "542.00",
        total_accessorials: "200.00",
        commodity: "Equipment",
        weight: 28000,
        dimensions: null,
        odometer_start: 313935,
        odometer_end: 314697,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000007",
        load_number: "LLL-9900001",
        load_type: "standard flatbed",
        load_status: "tonu",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: null,
        pickup_date: "2026-06-02T04:00:00.000Z",
        origin_city: "Memphis",
        origin_state: "TN",
        origin_market: "Memphis Market",
        receiver_name: null,
        delivery_date: null,
        destination_city: "Little Rock",
        destination_state: "AR",
        delivery_market: "Memphis Market",
        deadhead_miles: 0,
        loaded_miles: 0,
        linehaul: "350.00",
        fuel_surcharge: "0.00",
        total_accessorials: "0",
        commodity: null,
        weight: null,
        dimensions: null,
        odometer_start: null,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000003",
        load_number: "BMA-5359618",
        load_type: "hazmat",
        load_status: "delivered",
        broker: "BMA",
        agent: "Hailee Cartwright",
        shipper_name: "Roofing Supply Co",
        pickup_date: "2026-05-31T04:00:00.000Z",
        origin_city: "New Columbia",
        origin_state: "PA",
        origin_market: "Columbus Market",
        receiver_name: "Carolina Dist Center",
        delivery_date: "2026-06-01T04:00:00.000Z",
        destination_city: "Fayetteville",
        destination_state: "NC",
        delivery_market: "Charlotte Market",
        deadhead_miles: 18,
        loaded_miles: 520,
        linehaul: "2283.00",
        fuel_surcharge: "411.00",
        total_accessorials: "150.00",
        commodity: "Roofing Materials",
        weight: 36000,
        dimensions: null,
        odometer_start: 313397,
        odometer_end: 314512,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-09T01:10:50.771Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000002",
        load_number: "AGJ-9012345",
        load_type: "oversize",
        load_status: "delivered",
        broker: "AGJ",
        agent: "Ausra Jaronis",
        shipper_name: "Crane Works",
        pickup_date: "2026-05-28T04:00:00.000Z",
        origin_city: "Atlanta",
        origin_state: "GA",
        origin_market: "Atlanta Market",
        receiver_name: "Philadelphia Port",
        delivery_date: "2026-05-30T04:00:00.000Z",
        destination_city: "Philadelphia",
        destination_state: "PA",
        delivery_market: "Philadelphia Market",
        deadhead_miles: 45,
        loaded_miles: 1050,
        linehaul: "3400.00",
        fuel_surcharge: "612.00",
        total_accessorials: "625.00",
        commodity: "Industrial Crane",
        weight: 68000,
        dimensions: null,
        odometer_start: 312302,
        odometer_end: 313397,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000001",
        load_number: "LLL-2881760",
        load_type: "standard flatbed",
        load_status: "delivered",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: "ABC Manufacturing",
        pickup_date: "2026-05-24T04:00:00.000Z",
        origin_city: "Chicago",
        origin_state: "IL",
        origin_market: "Chicago Market",
        receiver_name: "Nashville Depot",
        delivery_date: "2026-05-25T04:00:00.000Z",
        destination_city: "Nashville",
        destination_state: "TN",
        delivery_market: "Nashville Market",
        deadhead_miles: 22,
        loaded_miles: 480,
        linehaul: "2100.00",
        fuel_surcharge: "387.00",
        total_accessorials: "0",
        commodity: "Steel Coils",
        weight: 42000,
        dimensions: null,
        odometer_start: 311800,
        odometer_end: 312302,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000006",
        load_number: "KJK-1100234",
        load_type: "standard flatbed",
        load_status: "booked",
        broker: "KJK",
        agent: "Jennifer Heggen",
        shipper_name: null,
        pickup_date: "2026-01-09T05:00:00.000Z",
        origin_city: "Charlotte",
        origin_state: "NC",
        origin_market: "Charlotte Market",
        receiver_name: null,
        delivery_date: "2026-06-11T04:00:00.000Z",
        destination_city: "Chicago",
        destination_state: "IL",
        delivery_market: "Chicago Market",
        deadhead_miles: 55,
        loaded_miles: 790,
        linehaul: "2800.00",
        fuel_surcharge: "504.00",
        total_accessorials: "0",
        commodity: "Machinery",
        weight: null,
        dimensions: null,
        odometer_start: null,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-09T22:47:55.126Z",
      },
    ];

    const result = getRevenueMTD(loads as any);

    expect(result).toBe(11495);
  });
});

// ---- GET LAST MONTHS REVENUE TEST ----
describe("getRevenueLastMonth", () => {
  it("returns the total revenue for previous month", () => {
    const loads = [
      {
        load_id: "4e519969-9069-4482-9342-dcb60e88115c",
        load_number: "5138745",
        load_type: "standard flatbed",
        load_status: "in_transit",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: null,
        pickup_date: "2026-06-08T04:00:00.000Z",
        origin_city: "Leighton",
        origin_state: "AL",
        origin_market: "Atlanta Market",
        receiver_name: null,
        delivery_date: "2026-06-09T04:00:00.000Z",
        destination_city: "Sussex",
        destination_state: "AL",
        delivery_market: "Charlotte Market",
        deadhead_miles: 200,
        loaded_miles: 1000,
        linehaul: "1000.00",
        fuel_surcharge: "300.00",
        total_accessorials: "0",
        commodity: null,
        weight: null,
        dimensions: null,
        odometer_start: 200000,
        odometer_end: 201000,
        payment_status: "unpaid",
        created_at: "2026-06-09T01:12:22.644Z",
        updated_at: "2026-06-14T23:28:57.856Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000005",
        load_number: "AGJ-6455657",
        load_type: "heavy haul",
        load_status: "delivered",
        broker: "AGJ",
        agent: "Ausra Jaronis",
        shipper_name: "Ohio Heavy Equipment",
        pickup_date: "2026-06-06T04:00:00.000Z",
        origin_city: "West Chester",
        origin_state: "OH",
        origin_market: "Memphis Market",
        receiver_name: "Brandywine Yard",
        delivery_date: "2026-06-08T04:00:00.000Z",
        destination_city: "Brandywine",
        destination_state: "MD",
        delivery_market: "Philadelphia Market",
        deadhead_miles: 30,
        loaded_miles: 440,
        linehaul: "4000.00",
        fuel_surcharge: "720.00",
        total_accessorials: "175.00",
        commodity: "Excavator",
        weight: 78000,
        dimensions: null,
        odometer_start: 314697,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-14T22:58:45.144Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000004",
        load_number: "LLL-9476094",
        load_type: "standard flatbed",
        load_status: "delivered",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: "Troutman Industries",
        pickup_date: "2026-06-03T04:00:00.000Z",
        origin_city: "Troutman",
        origin_state: "NC",
        origin_market: "Charlotte Market",
        receiver_name: "Hebron Logistics",
        delivery_date: "2026-06-04T04:00:00.000Z",
        destination_city: "Hebron",
        destination_state: "OH",
        delivery_market: "Columbus Market",
        deadhead_miles: 150,
        loaded_miles: 610,
        linehaul: "3014.00",
        fuel_surcharge: "542.00",
        total_accessorials: "200.00",
        commodity: "Equipment",
        weight: 28000,
        dimensions: null,
        odometer_start: 313935,
        odometer_end: 314697,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000007",
        load_number: "LLL-9900001",
        load_type: "standard flatbed",
        load_status: "tonu",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: null,
        pickup_date: "2026-06-02T04:00:00.000Z",
        origin_city: "Memphis",
        origin_state: "TN",
        origin_market: "Memphis Market",
        receiver_name: null,
        delivery_date: null,
        destination_city: "Little Rock",
        destination_state: "AR",
        delivery_market: "Memphis Market",
        deadhead_miles: 0,
        loaded_miles: 0,
        linehaul: "350.00",
        fuel_surcharge: "0.00",
        total_accessorials: "0",
        commodity: null,
        weight: null,
        dimensions: null,
        odometer_start: null,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000003",
        load_number: "BMA-5359618",
        load_type: "hazmat",
        load_status: "delivered",
        broker: "BMA",
        agent: "Hailee Cartwright",
        shipper_name: "Roofing Supply Co",
        pickup_date: "2026-05-31T04:00:00.000Z",
        origin_city: "New Columbia",
        origin_state: "PA",
        origin_market: "Columbus Market",
        receiver_name: "Carolina Dist Center",
        delivery_date: "2026-06-01T04:00:00.000Z",
        destination_city: "Fayetteville",
        destination_state: "NC",
        delivery_market: "Charlotte Market",
        deadhead_miles: 18,
        loaded_miles: 520,
        linehaul: "2283.00",
        fuel_surcharge: "411.00",
        total_accessorials: "150.00",
        commodity: "Roofing Materials",
        weight: 36000,
        dimensions: null,
        odometer_start: 313397,
        odometer_end: 314512,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-09T01:10:50.771Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000002",
        load_number: "AGJ-9012345",
        load_type: "oversize",
        load_status: "delivered",
        broker: "AGJ",
        agent: "Ausra Jaronis",
        shipper_name: "Crane Works",
        pickup_date: "2026-05-28T04:00:00.000Z",
        origin_city: "Atlanta",
        origin_state: "GA",
        origin_market: "Atlanta Market",
        receiver_name: "Philadelphia Port",
        delivery_date: "2026-05-30T04:00:00.000Z",
        destination_city: "Philadelphia",
        destination_state: "PA",
        delivery_market: "Philadelphia Market",
        deadhead_miles: 45,
        loaded_miles: 1050,
        linehaul: "3400.00",
        fuel_surcharge: "612.00",
        total_accessorials: "625.00",
        commodity: "Industrial Crane",
        weight: 68000,
        dimensions: null,
        odometer_start: 312302,
        odometer_end: 313397,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000001",
        load_number: "LLL-2881760",
        load_type: "standard flatbed",
        load_status: "delivered",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: "ABC Manufacturing",
        pickup_date: "2026-05-24T04:00:00.000Z",
        origin_city: "Chicago",
        origin_state: "IL",
        origin_market: "Chicago Market",
        receiver_name: "Nashville Depot",
        delivery_date: "2026-05-25T04:00:00.000Z",
        destination_city: "Nashville",
        destination_state: "TN",
        delivery_market: "Nashville Market",
        deadhead_miles: 22,
        loaded_miles: 480,
        linehaul: "2100.00",
        fuel_surcharge: "387.00",
        total_accessorials: "0",
        commodity: "Steel Coils",
        weight: 42000,
        dimensions: null,
        odometer_start: 311800,
        odometer_end: 312302,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000006",
        load_number: "KJK-1100234",
        load_type: "standard flatbed",
        load_status: "booked",
        broker: "KJK",
        agent: "Jennifer Heggen",
        shipper_name: null,
        pickup_date: "2026-01-09T05:00:00.000Z",
        origin_city: "Charlotte",
        origin_state: "NC",
        origin_market: "Charlotte Market",
        receiver_name: null,
        delivery_date: "2026-06-11T04:00:00.000Z",
        destination_city: "Chicago",
        destination_state: "IL",
        delivery_market: "Chicago Market",
        deadhead_miles: 55,
        loaded_miles: 790,
        linehaul: "2800.00",
        fuel_surcharge: "504.00",
        total_accessorials: "0",
        commodity: "Machinery",
        weight: null,
        dimensions: null,
        odometer_start: null,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-09T22:47:55.126Z",
      },
    ];

    const result = getRevenueLastMonth(loads as any);

    expect(result).toBe(7124);
  });

  it("rolls back to December of the prior year in January", () => {
    // The bug: in January, `getUTCMonth() - 1` is -1 (no month) AND the year
    // filter demanded the current year, so December's revenue read as $0 and
    // the month-over-month delta broke for all of January.
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    const loads = [
      // December 2025 — this is "last month" and must count.
      {
        load_status: "delivered",
        delivery_date: "2025-12-20T05:00:00.000Z",
        linehaul: "3000.00",
        fuel_surcharge: "500.00",
        total_accessorials: "0",
      },
      // January 2026 — current month, must NOT count as last month.
      {
        load_status: "delivered",
        delivery_date: "2026-01-05T05:00:00.000Z",
        linehaul: "9999.00",
        fuel_surcharge: "0.00",
        total_accessorials: "0",
      },
      // November 2025 — a month too early, excluded.
      {
        load_status: "delivered",
        delivery_date: "2025-11-15T05:00:00.000Z",
        linehaul: "1000.00",
        fuel_surcharge: "0.00",
        total_accessorials: "0",
      },
    ];

    expect(getRevenueLastMonth(loads as any)).toBe(3500);
  });
});

// ---- GET REVENUE YTD ----
describe("getRevenueYTD", () => {
  it("returns the total revenue for the year", () => {
    const loads = [
      {
        load_id: "4e519969-9069-4482-9342-dcb60e88115c",
        load_number: "5138745",
        load_type: "standard flatbed",
        load_status: "in_transit",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: null,
        pickup_date: "2026-06-08T04:00:00.000Z",
        origin_city: "Leighton",
        origin_state: "AL",
        origin_market: "Atlanta Market",
        receiver_name: null,
        delivery_date: "2026-06-09T04:00:00.000Z",
        destination_city: "Sussex",
        destination_state: "AL",
        delivery_market: "Charlotte Market",
        deadhead_miles: 200,
        loaded_miles: 1000,
        linehaul: "1000.00",
        fuel_surcharge: "300.00",
        total_accessorials: "0",
        commodity: null,
        weight: null,
        dimensions: null,
        odometer_start: 200000,
        odometer_end: 201000,
        payment_status: "unpaid",
        created_at: "2026-06-09T01:12:22.644Z",
        updated_at: "2026-06-14T23:28:57.856Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000005",
        load_number: "AGJ-6455657",
        load_type: "heavy haul",
        load_status: "delivered",
        broker: "AGJ",
        agent: "Ausra Jaronis",
        shipper_name: "Ohio Heavy Equipment",
        pickup_date: "2026-06-06T04:00:00.000Z",
        origin_city: "West Chester",
        origin_state: "OH",
        origin_market: "Memphis Market",
        receiver_name: "Brandywine Yard",
        delivery_date: "2026-06-08T04:00:00.000Z",
        destination_city: "Brandywine",
        destination_state: "MD",
        delivery_market: "Philadelphia Market",
        deadhead_miles: 30,
        loaded_miles: 440,
        linehaul: "4000.00",
        fuel_surcharge: "720.00",
        total_accessorials: "175.00",
        commodity: "Excavator",
        weight: 78000,
        dimensions: null,
        odometer_start: 314697,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-14T22:58:45.144Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000004",
        load_number: "LLL-9476094",
        load_type: "standard flatbed",
        load_status: "delivered",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: "Troutman Industries",
        pickup_date: "2026-06-03T04:00:00.000Z",
        origin_city: "Troutman",
        origin_state: "NC",
        origin_market: "Charlotte Market",
        receiver_name: "Hebron Logistics",
        delivery_date: "2026-06-04T04:00:00.000Z",
        destination_city: "Hebron",
        destination_state: "OH",
        delivery_market: "Columbus Market",
        deadhead_miles: 150,
        loaded_miles: 610,
        linehaul: "3014.00",
        fuel_surcharge: "542.00",
        total_accessorials: "200.00",
        commodity: "Equipment",
        weight: 28000,
        dimensions: null,
        odometer_start: 313935,
        odometer_end: 314697,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000007",
        load_number: "LLL-9900001",
        load_type: "standard flatbed",
        load_status: "tonu",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: null,
        pickup_date: "2026-06-02T04:00:00.000Z",
        origin_city: "Memphis",
        origin_state: "TN",
        origin_market: "Memphis Market",
        receiver_name: null,
        delivery_date: null,
        destination_city: "Little Rock",
        destination_state: "AR",
        delivery_market: "Memphis Market",
        deadhead_miles: 0,
        loaded_miles: 0,
        linehaul: "350.00",
        fuel_surcharge: "0.00",
        total_accessorials: "0",
        commodity: null,
        weight: null,
        dimensions: null,
        odometer_start: null,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000003",
        load_number: "BMA-5359618",
        load_type: "hazmat",
        load_status: "delivered",
        broker: "BMA",
        agent: "Hailee Cartwright",
        shipper_name: "Roofing Supply Co",
        pickup_date: "2026-05-31T04:00:00.000Z",
        origin_city: "New Columbia",
        origin_state: "PA",
        origin_market: "Columbus Market",
        receiver_name: "Carolina Dist Center",
        delivery_date: "2026-06-01T04:00:00.000Z",
        destination_city: "Fayetteville",
        destination_state: "NC",
        delivery_market: "Charlotte Market",
        deadhead_miles: 18,
        loaded_miles: 520,
        linehaul: "2283.00",
        fuel_surcharge: "411.00",
        total_accessorials: "150.00",
        commodity: "Roofing Materials",
        weight: 36000,
        dimensions: null,
        odometer_start: 313397,
        odometer_end: 314512,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-09T01:10:50.771Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000002",
        load_number: "AGJ-9012345",
        load_type: "oversize",
        load_status: "delivered",
        broker: "AGJ",
        agent: "Ausra Jaronis",
        shipper_name: "Crane Works",
        pickup_date: "2026-05-28T04:00:00.000Z",
        origin_city: "Atlanta",
        origin_state: "GA",
        origin_market: "Atlanta Market",
        receiver_name: "Philadelphia Port",
        delivery_date: "2026-05-30T04:00:00.000Z",
        destination_city: "Philadelphia",
        destination_state: "PA",
        delivery_market: "Philadelphia Market",
        deadhead_miles: 45,
        loaded_miles: 1050,
        linehaul: "3400.00",
        fuel_surcharge: "612.00",
        total_accessorials: "625.00",
        commodity: "Industrial Crane",
        weight: 68000,
        dimensions: null,
        odometer_start: 312302,
        odometer_end: 313397,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000001",
        load_number: "LLL-2881760",
        load_type: "standard flatbed",
        load_status: "delivered",
        broker: "LLL",
        agent: "Mike Sorrentino",
        shipper_name: "ABC Manufacturing",
        pickup_date: "2026-05-24T04:00:00.000Z",
        origin_city: "Chicago",
        origin_state: "IL",
        origin_market: "Chicago Market",
        receiver_name: "Nashville Depot",
        delivery_date: "2026-05-25T04:00:00.000Z",
        destination_city: "Nashville",
        destination_state: "TN",
        delivery_market: "Nashville Market",
        deadhead_miles: 22,
        loaded_miles: 480,
        linehaul: "2100.00",
        fuel_surcharge: "387.00",
        total_accessorials: "0",
        commodity: "Steel Coils",
        weight: 42000,
        dimensions: null,
        odometer_start: 311800,
        odometer_end: 312302,
        payment_status: "paid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-07T20:28:52.929Z",
      },
      {
        load_id: "10000000-0000-0000-0000-000000000006",
        load_number: "KJK-1100234",
        load_type: "standard flatbed",
        load_status: "booked",
        broker: "KJK",
        agent: "Jennifer Heggen",
        shipper_name: null,
        pickup_date: "2026-01-09T05:00:00.000Z",
        origin_city: "Charlotte",
        origin_state: "NC",
        origin_market: "Charlotte Market",
        receiver_name: null,
        delivery_date: "2026-06-11T04:00:00.000Z",
        destination_city: "Chicago",
        destination_state: "IL",
        delivery_market: "Chicago Market",
        deadhead_miles: 55,
        loaded_miles: 790,
        linehaul: "2800.00",
        fuel_surcharge: "504.00",
        total_accessorials: "0",
        commodity: "Machinery",
        weight: null,
        dimensions: null,
        odometer_start: null,
        odometer_end: null,
        payment_status: "unpaid",
        created_at: "2026-06-07T20:28:52.929Z",
        updated_at: "2026-06-09T22:47:55.126Z",
      },
    ];

    const result = getRevenueYTD(loads as any);

    expect(result).toBe(18619);
  });
});

// ---- GET MONTHLY REVENUE TEST ----
describe("getMonthlyRevenue", () => {
  it("returns continuous months with zeros for empty months", () => {
    const loads = [
      {
        load_status: "delivered",
        delivery_date: "2026-05-30T04:00:00.000Z",
        linehaul: "3400.00",
        fuel_surcharge: "612.00",
        total_accessorials: "625.00",
        loaded_miles: 1050,
      },
      {
        load_status: "delivered",
        delivery_date: "2026-05-25T04:00:00.000Z",
        linehaul: "2100.00",
        fuel_surcharge: "387.00",
        total_accessorials: "0",
        loaded_miles: 480,
      },
      {
        load_status: "delivered",
        delivery_date: "2026-06-04T04:00:00.000Z",
        linehaul: "3014.00",
        fuel_surcharge: "542.00",
        total_accessorials: "200.00",
        loaded_miles: 610,
      },
      {
        load_status: "in_transit",
        delivery_date: "2026-06-09T04:00:00.000Z",
        linehaul: "1000.00",
        fuel_surcharge: "300.00",
        total_accessorials: "0",
        loaded_miles: 1000,
      },
    ];

    const result = getMonthlyRevenue(loads as any, 12);

    // 12 months, Jul 2025 → Jun 2026 (frozen "now" = 2026-06-22)
    expect(result).toHaveLength(12);
    expect(result[0].month).toBe("2025-07");
    expect(result[11].month).toBe("2026-06");

    // May and June populated, everything else 0
    const may = result.find((r) => r.month === "2026-05");
    const june = result.find((r) => r.month === "2026-06");
    const april = result.find((r) => r.month === "2026-04");
    expect(may?.revenue).toBe(7124);
    expect(june?.revenue).toBe(3756);
    expect(april?.revenue).toBe(0); // empty month filled with zero
  });
});

// ---- GET MONTHLY RPM TEST ----
describe("getMonthlyRPM", () => {
  it("returns continuous months with null RPM for empty months", () => {
    const loads = [
      {
        load_status: "delivered",
        delivery_date: "2026-05-30T04:00:00.000Z",
        linehaul: "3400.00",
        fuel_surcharge: "612.00",
        total_accessorials: "625.00",
        loaded_miles: 1050,
      },
      {
        load_status: "delivered",
        delivery_date: "2026-05-25T04:00:00.000Z",
        linehaul: "2100.00",
        fuel_surcharge: "387.00",
        total_accessorials: "0",
        loaded_miles: 480,
      },
      {
        load_status: "delivered",
        delivery_date: "2026-06-04T04:00:00.000Z",
        linehaul: "3014.00",
        fuel_surcharge: "542.00",
        total_accessorials: "200.00",
        loaded_miles: 610,
      },
    ];

    const result = getMonthlyRPM(loads as any, 12);

    expect(result).toHaveLength(12);

    const may = result.find((r) => r.month === "2026-05");
    const june = result.find((r) => r.month === "2026-06");
    const april = result.find((r) => r.month === "2026-04");
    expect(may?.rpm).toBeCloseTo(7124 / 1530, 4);
    expect(june?.rpm).toBeCloseTo(3756 / 610, 4);
    expect(april?.rpm).toBeNull(); // empty month → null (line gap)
  });
});

// ---- GET OUTSTANDING LOADS TEST ----
describe("getOutstandingLoads", () => {
  it("returns delivered unpaid/invoiced loads, aged from delivery, oldest first", () => {
    const loads = [
      // delivered + unpaid, delivered 2026-06-01 → 21 days ago (from 06-22)
      {
        load_number: "BMA-5359618",
        broker: "BMA",
        load_status: "delivered",
        payment_status: "unpaid",
        delivery_date: "2026-06-01T04:00:00.000Z",
        linehaul: "2283.00",
        fuel_surcharge: "411.00",
        total_accessorials: "150.00",
      },
      // delivered + invoiced, delivered 2026-05-30 → 23 days ago (oldest → should be first)
      {
        load_number: "AGJ-9012345",
        broker: "AGJ",
        load_status: "delivered",
        payment_status: "invoiced",
        delivery_date: "2026-05-30T04:00:00.000Z",
        linehaul: "3400.00",
        fuel_surcharge: "612.00",
        total_accessorials: "625.00",
      },
      // delivered + PAID → excluded
      {
        load_number: "LLL-2881760",
        broker: "LLL",
        load_status: "delivered",
        payment_status: "paid",
        delivery_date: "2026-05-25T04:00:00.000Z",
        linehaul: "2100.00",
        fuel_surcharge: "387.00",
        total_accessorials: "0",
      },
      // unpaid but NOT delivered (booked) → excluded
      {
        load_number: "KJK-1100234",
        broker: "KJK",
        load_status: "booked",
        payment_status: "unpaid",
        delivery_date: "2026-06-11T04:00:00.000Z",
        linehaul: "2800.00",
        fuel_surcharge: "504.00",
        total_accessorials: "0",
      },
    ];

    const result = getOutstandingLoads(loads as any);

    // Only the two delivered + unpaid/invoiced loads
    expect(result).toHaveLength(2);

    // Oldest first: AGJ (May 30) before BMA (Jun 1)
    expect(result[0].load_number).toBe("AGJ-9012345");
    expect(result[1].load_number).toBe("BMA-5359618");

    // Aging from delivery (frozen now = 2026-06-22)
    expect(result[0].daysOutstanding).toBe(23); // Jun 22 − May 30
    expect(result[1].daysOutstanding).toBe(21); // Jun 22 − Jun 1

    // Revenue computed
    expect(result[0].revenue).toBe(4637); // 3400 + 612 + 625
    expect(result[1].revenue).toBe(2844); // 2283 + 411 + 150
  });
});

// ---- DEADHEAD TREND ---- (clock frozen 2026-06-22 → 90-day window = Mar 24 →)
describe("getDeadheadTrend", () => {
  it("computes this month vs the trailing 90-day average", () => {
    const loads = [
      // June (this month): window 500, loaded 400 → 100 empty
      makeLoad({
        delivery_date: "2026-06-10T04:00:00.000Z",
        odometer_start: 100000,
        odometer_end: 100500,
        loaded_miles: 400,
      }),
      // April (in the 90-day window, NOT this month): window 300, loaded 300
      makeLoad({
        delivery_date: "2026-04-15T04:00:00.000Z",
        odometer_start: 90000,
        odometer_end: 90300,
        loaded_miles: 300,
      }),
      // February (older than 90 days): all empty, must be EXCLUDED from both
      makeLoad({
        delivery_date: "2026-02-10T04:00:00.000Z",
        odometer_start: 80000,
        odometer_end: 81000,
        loaded_miles: 0,
      }),
    ];

    const result = getDeadheadTrend(loads, []);
    // June only: 100/500
    expect(result.thisMonth).toBeCloseTo(0.2, 5);
    // June + April (Feb excluded): total 800, loaded 700 → 100/800
    expect(result.rolling90).toBeCloseTo(0.125, 5);
  });

  it("returns null on each side when its window has no qualifying miles", () => {
    const result = getDeadheadTrend([], []);
    expect(result.thisMonth).toBeNull();
    expect(result.rolling90).toBeNull();
  });
});

// ---- DETENTION OWED ---- (hours past free time, still uncollected)
describe("getDetentionOwed", () => {
  it("sums hours + loads for uncollected detention, longest first", () => {
    const loads = [
      // 5h dwell, 2h free → 180 min owed
      makeLoad({
        load_id: "A",
        load_number: "A1",
        shipper_in: "08:00",
        shipper_out: "13:00",
        detention_paid: false,
      }),
      // 2h30 dwell, 2h free → 30 min owed
      makeLoad({
        load_id: "B",
        load_number: "B1",
        receiver_in: "10:00",
        receiver_out: "12:30",
        detention_paid: false,
      }),
      // detention ran but already collected → excluded
      makeLoad({
        load_id: "C",
        load_number: "C1",
        shipper_in: "08:00",
        shipper_out: "13:00",
        detention_paid: true,
      }),
      // dwell inside free time → no detention → excluded
      makeLoad({
        load_id: "D",
        load_number: "D1",
        shipper_in: "08:00",
        shipper_out: "09:00",
        detention_paid: false,
      }),
    ];

    const result = getDetentionOwed(loads, 2);
    expect(result.loadCount).toBe(2);
    expect(result.totalMinutes).toBe(210); // 180 + 30
    expect(result.items.map((i) => i.load_number)).toEqual(["A1", "B1"]); // sorted desc
    expect(result.items[0].minutes).toBe(180);
  });

  it("returns an empty summary when nothing is owed", () => {
    const result = getDetentionOwed([], 2);
    expect(result).toEqual({ loadCount: 0, totalMinutes: 0, items: [] });
  });
});
