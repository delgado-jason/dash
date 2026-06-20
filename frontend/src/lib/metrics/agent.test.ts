import { describe, it, expect } from "vitest";
import {
  getLoadCount,
  getCancelledCount,
  getGrossRevenue,
  getAverageRPM,
  getLastLoadDate,
  getTotalLoads,
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
