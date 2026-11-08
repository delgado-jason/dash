import { describe, expect, it } from "vitest";
import { isDelivered, isNeverRevenue, NEVER_REVENUE } from "./status";

describe("status · one definition of delivered and never-revenue", () => {
  it("isDelivered is true only for load_status delivered", () => {
    expect(isDelivered({ load_status: "delivered" })).toBe(true);
    for (const s of ["booked", "in_transit", "cancelled", "tonu", "invoiced", "paid", ""]) {
      expect(isDelivered({ load_status: s })).toBe(false);
    }
  });
  it("NEVER_REVENUE is exactly cancelled and tonu", () => {
    expect([...NEVER_REVENUE].sort()).toEqual(["cancelled", "tonu"]);
    expect(isNeverRevenue({ load_status: "cancelled" })).toBe(true);
    expect(isNeverRevenue({ load_status: "tonu" })).toBe(true);
    for (const s of ["booked", "in_transit", "delivered"]) {
      expect(isNeverRevenue({ load_status: s })).toBe(false);
    }
  });
});
