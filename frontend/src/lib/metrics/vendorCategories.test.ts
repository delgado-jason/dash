import { describe, it, expect } from "vitest";
import { vendorCategoryFor } from "./vendorCategories";

describe("vendorCategoryFor", () => {
  it("links the categories that really have a directory behind them", () => {
    expect(vendorCategoryFor("Repairs & maintenance")).toBe("Shop");
    expect(vendorCategoryFor("Permits - Truck")).toBe("Permits");
  });

  it("is case- and whitespace-insensitive — P&L names arrive from an export", () => {
    // Trailing spaces and case drift have both shown up in this data before.
    expect(vendorCategoryFor("  REPAIRS & MAINTENANCE  ")).toBe("Shop");
    expect(vendorCategoryFor("repairs and maintenance")).toBe("Shop");
  });

  it("says nothing for the categories that have no vendor behind them", () => {
    for (const c of ["Fuel", "Payroll expenses", "Insurance", "Utilities", "Taxes paid"]) {
      expect(vendorCategoryFor(c)).toBeNull();
    }
  });

  it("NEVER matches on a substring — a wrong link is worse than none", () => {
    // "Trailer Plates" contains neither key, and must not be dragged to Permits
    // by a loose contains() match.
    expect(vendorCategoryFor("Trailer Plates")).toBeNull();
    expect(vendorCategoryFor("Repairs & maintenance - trailer")).toBeNull();
  });

  it("handles the empty and missing cases without throwing", () => {
    expect(vendorCategoryFor(null)).toBeNull();
    expect(vendorCategoryFor(undefined)).toBeNull();
    expect(vendorCategoryFor("")).toBeNull();
    expect(vendorCategoryFor("   ")).toBeNull();
  });
});
