import { describe, it, expect } from "vitest";
import {
  getLoadCount,
  getCancelledCount,
  getGrossRevenue,
  getAverageRPM,
  getLastLoadDate,
  getTotalLoads,
  buildTimeline,
} from "./agent";

// ---- LOAD COUNT TEST ----
describe("getLoadCount", () => {
  it("returns the count of non-cancelled loads", () => {
    const loads = [
      {
        load_status: "delivered",
      },
      {
        load_status: "delivered",
      },
      {
        load_status: "cancelled",
      },
    ];

    const result = getLoadCount(loads as any);

    expect(result).toBe(2);
  });
});

// ---- CANCELLED COUNT TEST ----
describe("getCancelledCount", () => {
  it("returns the count of cancelled loads", () => {
    const loads = [
      {
        load_status: "delivered",
      },
      {
        load_status: "delivered",
      },
      {
        load_status: "cancelled",
      },
    ];

    const result = getCancelledCount(loads as any);

    expect(result).toBe(1);
  });
});

// ---- GROSS REVENUE TEST ---- (excludes cancelled and filters by delivered)
describe("getGrossRevenue", () => {
  it("returns the gross revenue of non-cancelled, delivered loads", () => {
    const loads = [
      {
        load_status: "delivered", // $1400
        linehaul: 1000,
        fuel_surcharge: 300,
        total_accessorials: 100,
      },
      {
        load_status: "delivered", // $3000
        linehaul: 2000,
        fuel_surcharge: 700,
        total_accessorials: 300,
      },
      {
        load_status: "cancelled", // $2000
        linehaul: 1500,
        fuel_surcharge: 300,
        total_accessorials: 200,
      },
      {
        load_status: "booked", // $800
        linehaul: 700,
        fuel_surcharge: 100,
        total_accessorials: 0,
      },
      {
        load_status: "in_transit", // $1200
        linehaul: 800,
        fuel_surcharge: 200,
        total_accessorials: 200,
      },
    ];

    const result = getGrossRevenue(loads as any);

    expect(result).toBe(4400);
  });
});

// ---- AVERAGE RPM ---- (Gross revenue / total 'paid' miles)
describe("getAverageRPM", () => {
  it("returns average RPM on paid loads", () => {
    const loads = [
      {
        load_status: "delivered", // $1400
        linehaul: 1000,
        fuel_surcharge: 300,
        total_accessorials: 100,
        payment_status: "invoiced",
        loaded_miles: 200,
      },
      {
        load_status: "delivered", // $3000
        linehaul: 2000,
        fuel_surcharge: 700,
        total_accessorials: 300,
        payment_status: "paid",
        loaded_miles: 500,
      },
      {
        load_status: "delivered", // $5400
        linehaul: 4000,
        fuel_surcharge: 900,
        total_accessorials: 500,
        payment_status: "paid",
        loaded_miles: 1000,
      },
      {
        load_status: "cancelled", // $2000
        linehaul: 1500,
        fuel_surcharge: 300,
        total_accessorials: 200,
        payment_status: "cancelled",
        loaded_miles: 0,
      },
      {
        load_status: "booked", // $800
        linehaul: 700,
        fuel_surcharge: 100,
        total_accessorials: 0,
        payment_status: "unpaid",
        loaded_miles: 300,
      },
      {
        load_status: "in_transit", // $1200
        linehaul: 800,
        fuel_surcharge: 200,
        total_accessorials: 200,
        payment_status: "unpaid",
        loaded_miles: 200,
      },
    ];

    const result = getAverageRPM(loads as any);

    expect(result).toBe(5.764705882352941);
  });
});

// ---- GET THE DATE LAST LOAD WAS DELIVERED ----
describe("getLastLoadDate", () => {
  it("returns the date of the most recent delivered load", () => {
    const loads = [
      {
        load_status: "delivered", // $5400
        linehaul: 4000,
        fuel_surcharge: 900,
        total_accessorials: 500,
        payment_status: "paid",
        loaded_miles: 1000,
        delivery_date: "2026-05-02T00:00:00.000Z",
      },
      {
        load_status: "delivered", // $5400
        linehaul: 4000,
        fuel_surcharge: 900,
        total_accessorials: 500,
        payment_status: "paid",
        loaded_miles: 1000,
        delivery_date: "2026-06-23T00:00:00.000Z",
      },
      {
        load_status: "delivered", // $5400
        linehaul: 4000,
        fuel_surcharge: 900,
        total_accessorials: 500,
        payment_status: "paid",
        loaded_miles: 1000,
        delivery_date: "2026-06-18T00:00:00.000Z",
      },
    ];

    const result = getLastLoadDate(loads as any);

    expect(result).toBe("2026-06-23T00:00:00.000Z");
  });
});

// ---- GET TOTAL LOADS ---- should be getLoadCount + getCancelledCount === total loads
describe("getTotalLoads", () => {
  it("returns total load count", () => {
    const loads = [
      {
        load_status: "delivered", // $1400
        linehaul: 1000,
        fuel_surcharge: 300,
        total_accessorials: 100,
      },
      {
        load_status: "delivered", // $3000
        linehaul: 2000,
        fuel_surcharge: 700,
        total_accessorials: 300,
      },
      {
        load_status: "cancelled", // $2000
        linehaul: 1500,
        fuel_surcharge: 300,
        total_accessorials: 200,
      },
      {
        load_status: "booked", // $800
        linehaul: 700,
        fuel_surcharge: 100,
        total_accessorials: 0,
      },
      {
        load_status: "in_transit", // $1200
        linehaul: 800,
        fuel_surcharge: 200,
        total_accessorials: 200,
      },
    ];

    const result = getTotalLoads(loads as any);
    expect(result).toBe(5);
  });
});

// ---- BUILD A TIMELINE ---- builds a timeline with two different data shapes
describe("buildTimeline", () => {
  it("builds a timeline with two different data shapes", () => {
    const notes = [
      {
        id: "0dce4633-e8c2-4b64-99b9-3edd4068d806",
        agent_id: "e0000000-0000-0000-0000-000000000004",
        note: "Agent is difficult to work with",
        created_at: "2026-06-21T22:35:07.444Z",
        created_by: "JD",
      },
      {
        id: "0dce4633-e8c2-4b64-99b9-3edd4068d806",
        agent_id: "e0000000-0000-0000-0000-000000000004",
        note: "Lied about the rate",
        created_at: "2026-06-21T20:35:07.444Z",
        created_by: "BD",
      },
      {
        id: "0dce4633-e8c2-4b64-99b9-3edd4068d806",
        agent_id: "e0000000-0000-0000-0000-000000000004",
        note: "Absolutely no communication",
        created_at: "2026-05-10T22:35:07.444Z",
        created_by: "JD",
      },
    ];

    const ratings = [
      {
        id: "3b75a745-8d04-43d2-902f-64ad5ab2c6b5",
        agent_id: "e0000000-0000-0000-0000-000000000003",
        old_rating: 1,
        new_rating: 2,
        reason: "Not blacklisted just yet",
        changed_by: "JD",
        changed_at: "2026-06-20T09:49:00.516Z",
      },
      {
        id: "51a22c7e-b668-4209-898f-151479903a33",
        agent_id: "e0000000-0000-0000-0000-000000000003",
        old_rating: 2,
        new_rating: 1,
        reason: "Blacklisted for bad communication",
        changed_by: "BD",
        changed_at: "2026-06-19T03:05:03.596Z",
      },
    ];

    const result = buildTimeline(notes, ratings);

    expect(result).toStrictEqual([
      {
        data: {
          agent_id: "e0000000-0000-0000-0000-000000000004",
          created_at: "2026-06-21T22:35:07.444Z",
          created_by: "JD",
          id: "0dce4633-e8c2-4b64-99b9-3edd4068d806",
          note: "Agent is difficult to work with",
        },
        timestamp: "2026-06-21T22:35:07.444Z",
        type: "note",
      },
      {
        data: {
          agent_id: "e0000000-0000-0000-0000-000000000004",
          created_at: "2026-06-21T20:35:07.444Z",
          created_by: "BD",
          id: "0dce4633-e8c2-4b64-99b9-3edd4068d806",
          note: "Lied about the rate",
        },
        timestamp: "2026-06-21T20:35:07.444Z",
        type: "note",
      },
      {
        data: {
          agent_id: "e0000000-0000-0000-0000-000000000003",
          changed_at: "2026-06-20T09:49:00.516Z",
          changed_by: "JD",
          id: "3b75a745-8d04-43d2-902f-64ad5ab2c6b5",
          new_rating: 2,
          old_rating: 1,
          reason: "Not blacklisted just yet",
        },
        timestamp: "2026-06-20T09:49:00.516Z",
        type: "rating",
      },
      {
        data: {
          agent_id: "e0000000-0000-0000-0000-000000000003",
          changed_at: "2026-06-19T03:05:03.596Z",
          changed_by: "BD",
          id: "51a22c7e-b668-4209-898f-151479903a33",
          new_rating: 1,
          old_rating: 2,
          reason: "Blacklisted for bad communication",
        },
        timestamp: "2026-06-19T03:05:03.596Z",
        type: "rating",
      },
      {
        data: {
          agent_id: "e0000000-0000-0000-0000-000000000004",
          created_at: "2026-05-10T22:35:07.444Z",
          created_by: "JD",
          id: "0dce4633-e8c2-4b64-99b9-3edd4068d806",
          note: "Absolutely no communication",
        },
        timestamp: "2026-05-10T22:35:07.444Z",
        type: "note",
      },
    ]);
  });
});
