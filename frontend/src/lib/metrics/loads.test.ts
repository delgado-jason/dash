import { describe, it, expect } from "vitest";
import {
  getBookedCount,
  getInTransitCount,
  getOutstandingTotal,
  outstandingLoads,
  deliveredThisMonth,
  loadRevenue,
  loadsKpis,
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

describe("loadRevenue", () => {
  it("sums linehaul, fuel surcharge, and accessorials (string-safe)", () => {
    const load = { linehaul: "1000", fuel_surcharge: "250.5", total_accessorials: "100" };
    expect(loadRevenue(load as any)).toBe(1350.5);
  });
});

describe("getInTransitCount", () => {
  it("counts only in_transit loads", () => {
    const loads = [
      { load_status: "in_transit" },
      { load_status: "booked" },
      { load_status: "in_transit" },
    ];
    expect(getInTransitCount(loads as any)).toBe(2);
  });
});

describe("outstandingLoads", () => {
  it("includes delivered+unpaid and any invoiced, excludes paid/booked", () => {
    const loads = [
      { load_status: "delivered", payment_status: "unpaid" }, // ✓
      { load_status: "in_transit", payment_status: "invoiced" }, // ✓ (invoiced regardless of status)
      { load_status: "delivered", payment_status: "paid" }, // ✗
      { load_status: "booked", payment_status: "unpaid" }, // ✗ (not delivered, not invoiced)
    ];
    expect(outstandingLoads(loads as any).length).toBe(2);
  });
});

describe("loadsKpis", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");

  it("aggregates delivered gross, RPM, AR, and pipeline", () => {
    const loads = [
      {
        load_status: "delivered",
        delivery_date: "2026-06-05T04:00:00.000Z",
        payment_status: "paid",
        linehaul: "2000",
        fuel_surcharge: "0",
        total_accessorials: "0",
        loaded_miles: 1000,
      },
      {
        load_status: "delivered",
        delivery_date: "2026-06-20T04:00:00.000Z",
        payment_status: "unpaid",
        linehaul: "1000",
        fuel_surcharge: "0",
        total_accessorials: "0",
        loaded_miles: 500,
      },
      { load_status: "booked", payment_status: "unpaid" },
      { load_status: "in_transit", payment_status: "unpaid" },
    ];

    const k = loadsKpis(loads as any, now);
    expect(k.deliveredCount).toBe(2);
    expect(k.deliveredGross).toBe(3000);
    expect(k.loadedMiles).toBe(1500);
    expect(k.rpm).toBeCloseTo(2); // 3000 / 1500
    expect(k.arTotal).toBe(1000); // the delivered+unpaid one
    expect(k.arCount).toBe(1);
    expect(k.bookedCount).toBe(1);
    expect(k.inTransitCount).toBe(1);
  });

  it("returns null RPM when there are no loaded miles", () => {
    const loads = [
      {
        load_status: "delivered",
        delivery_date: "2026-06-05T04:00:00.000Z",
        payment_status: "paid",
        linehaul: "2000",
        fuel_surcharge: "0",
        total_accessorials: "0",
        loaded_miles: 0,
      },
    ];
    expect(loadsKpis(loads as any, now).rpm).toBeNull();
  });
});
