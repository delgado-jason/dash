import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  getBookedCount,
  getInTransitCount,
  getOutstandingTotal,
  outstandingLoads,
  deliveredThisMonth,
  loadRevenue,
  loadsKpis,
  loadsViewTotals,
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
    const result = getBookedCount(loads as unknown as Load[]);

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

    const result = getOutstandingTotal(loads as unknown as Load[]);
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

    const result = deliveredThisMonth(loads as unknown as Load[], now);

    expect(result.length).toBe(2);
  });
});

describe("loadRevenue", () => {
  it("sums linehaul, fuel surcharge, and accessorials (string-safe)", () => {
    const load = { linehaul: "1000", fuel_surcharge: "250.5", total_accessorials: "100" };
    expect(loadRevenue(load as unknown as Load)).toBe(1350.5);
  });
});

describe("getInTransitCount", () => {
  it("counts only in_transit loads", () => {
    const loads = [
      { load_status: "in_transit" },
      { load_status: "booked" },
      { load_status: "in_transit" },
    ];
    expect(getInTransitCount(loads as unknown as Load[])).toBe(2);
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
    expect(outstandingLoads(loads as unknown as Load[]).length).toBe(2);
  });
});

describe("loadsKpis", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");

  it("aggregates delivered net, RPM, AR, and pipeline", () => {
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

    const k = loadsKpis(loads as unknown as Load[], now);
    expect(k.deliveredCount).toBe(2);
    expect(k.deliveredNet).toBe(3000);
    expect(k.loadedMiles).toBe(1500);
    expect(k.rpm).toBeCloseTo(2); // 3000 / 1500
    expect(k.arTotal).toBe(1000); // the delivered+unpaid one
    expect(k.arCount).toBe(1);
    expect(k.bookedCount).toBe(1);
    expect(k.inTransitCount).toBe(1);
  });

  it("reports net dollars but a gross rate/mile", () => {
    const loads = [
      {
        load_status: "delivered",
        delivery_date: "2026-06-05T04:00:00.000Z",
        payment_status: "unpaid", // also counts toward AR
        linehaul: "2000",
        fuel_surcharge: "0",
        total_accessorials: "0",
        gross_revenue: "2000",
        net_revenue: "1460", // 73% carrier take
        loaded_miles: 1000,
      },
    ];
    const k = loadsKpis(loads as unknown as Load[], now);
    expect(k.deliveredNet).toBe(1460); // dollars kept = net
    expect(k.arTotal).toBe(1460); // owed = net
    expect(k.rpm).toBeCloseTo(2); // rate/mile = gross (2000 / 1000)
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
    expect(loadsKpis(loads as unknown as Load[], now).rpm).toBeNull();
  });
});

describe("loadsViewTotals — the Loads page header (GL-104)", () => {
  const ld = (o: Record<string, unknown>) =>
    ({ load_status: "delivered", linehaul: "5000", fuel_surcharge: "0", total_accessorials: "0", loaded_miles: 1000, ...o }) as unknown as Load;

  it("a TONU earns nothing: gross and $/loaded mi ignore it", () => {
    const booked = [ld({}), ld({ linehaul: "4000" })];
    const tonu = ld({ load_status: "tonu", linehaul: "2500", loaded_miles: 301 });
    const t = loadsViewTotals([...booked, tonu]);
    expect(t.earning).toBe(2);
    expect(t.gross).toBe(9000);
    expect(t.miles).toBe(2000);
    expect(t.rpm).toBeCloseTo(4.5, 5);
  });

  it("...but it is still ON THE SCREEN, so the row count counts it", () => {
    // The header used to say "84 loads" above 85 rows, because a revenue rule
    // was doing double duty as a row filter.
    const booked = [ld({}), ld({ linehaul: "4000" })];
    const tonu = ld({ load_status: "tonu", linehaul: "2500", loaded_miles: 301 });
    expect(loadsViewTotals([...booked, tonu]).rows).toBe(3);
    expect(loadsViewTotals(booked).rows).toBe(2);
  });

  it("a view of only TONUs has its rows, no earnings and no rate", () => {
    const t = loadsViewTotals([ld({ load_status: "tonu", linehaul: "2500", loaded_miles: 301 })]);
    expect(t.rows).toBe(1); // never "0 loads in this view" above a visible row
    expect(t.earning).toBe(0);
    expect(t.gross).toBe(0);
    expect(t.rpm).toBeNull();
  });

  it("CANCELLED freight is never revenue either — it never moved", () => {
    // The old hand-rolled `!== "tonu"` let cancelled loads into the gross:
    // eight of them, $27,530, on Jason's book (2026-11-09).
    const t = loadsViewTotals([
      ld({}),
      ld({ load_status: "cancelled", linehaul: "9000", loaded_miles: 800 }),
    ]);
    expect(t.rows).toBe(2);
    expect(t.earning).toBe(1);
    expect(t.gross).toBe(5000); // not 14,000
    expect(t.miles).toBe(1000); // not 1,800
    expect(t.rpm).toBeCloseTo(5, 5);
  });

  it("holds the ONE never-revenue definition — not its own copy of it", () => {
    // status.ts owns cancelled+tonu; this used to spell its own, narrower set.
    const both = loadsViewTotals([
      ld({ load_status: "cancelled" }),
      ld({ load_status: "tonu" }),
    ]);
    expect(both.rows).toBe(2);
    expect(both.earning).toBe(0);
    expect(both.gross).toBe(0);
  });
});
