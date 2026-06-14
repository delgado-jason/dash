import { describe, it, expect } from "vitest";
import {
  getBookedCount,
  getOutstandingTotal,
  deliveredThisMonth,
} from "./loads";

describe("getBookedCount", () => {
  it("counts only loads with booked status", () => {
    // Arrange
    const loads = [
      { load_status: "booked" },
      { load_status: "delivered" },
      { load_status: "booked" },
      { load_status: "in_transit" },
    ];

    // Act
    const result = getBookedCount(loads as any);

    // Assert
    expect(result).toBe(2);
  });
});

describe("getOutstandingTotal", () => {
  it("filters loads by payment status of unpaid or invoiced with a load status of delivered", () => {
    const loads = [
      {
        load_status: "delivered",
        payment_status: "unpaid",
        linehaul: 1000,
        fuel_surcharge: 600,
        total_accessorials: 400,
      },
      {
        load_status: "delivered",
        payment_status: "invoiced",
        linehaul: 2000,
        fuel_surcharge: 500,
        total_accessorials: 400,
      },
      {
        load_status: "cancelled",
        payment_status: "cancelled",
        linehaul: 2500,
        fuel_surcharge: 600,
        total_accessorials: 400,
      },
      {
        load_status: "booked",
        payment_status: "unpaid",
        linehaul: 500,
        fuel_surcharge: 600,
        total_accessorials: 0,
      },
    ];

    const result = getOutstandingTotal(loads as any);
    expect(result).toBe(4900);
  });
});

describe("deliveredThisMonth", () => {
  it("returns number of loads delivered in current month", () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    const loads = [
      { load_status: "delivered", delivery_date: "2026-06-03T04:00:00.000Z" }, // this month ✓
      { load_status: "delivered", delivery_date: "2026-05-28T04:00:00.000Z" }, // last month ✗
      { load_status: "booked", delivery_date: "2026-06-10T04:00:00.000Z" }, // this month but not delivered ✗
      { load_status: "delivered", delivery_date: "2026-06-30T04:00:00.000Z" }, // month boundary ✓
      { load_status: "delivered", delivery_date: null }, // null delivery date ✓
    ];

    const result = deliveredThisMonth(loads as any, now);

    expect(result.length).toBe(2);
  });
});
