import { describe, it, expect } from "vitest";
import { fuelTaxByMonth, fuelTaxMonth } from "./fuelTax";

describe("fuelTaxMonth", () => {
  it("reads the month word and the settlement's year, rolling back across New Year", () => {
    expect(fuelTaxMonth("SEP FUEL TAX", "2026-10-28")).toBe("2026-09");
    expect(fuelTaxMonth("Dec Fuel Tax", "2026-01-16")).toBe("2025-12");
    expect(fuelTaxMonth("JAN FUEL TAX", "2026-03-04")).toBe("2026-01");
    expect(fuelTaxMonth("NOV FUEL TAX", "2025-12-31")).toBe("2025-11");
  });

  it("anything else is not a fuel-tax line", () => {
    expect(fuelTaxMonth("CARD FEE", "2026-10-28")).toBeNull();
    expect(fuelTaxMonth("FUEL SURCHARGE 1,053.60 100.0%", "2026-10-28")).toBeNull();
    expect(fuelTaxMonth("XYZ FUEL TAX", "2026-10-28")).toBeNull();
    expect(fuelTaxMonth("SEP FUEL TAX", "10-28")).toBeNull();
  });
});

describe("fuelTaxByMonth", () => {
  it("one row per month, newest first, amounts summed, the latest settlement kept", () => {
    const rows = fuelTaxByMonth([
      { description: "SEP FUEL TAX", deductions: "91.00", period_ending: "2026-10-28" },
      { description: "AUG FUEL TAX", deductions: 58, period_ending: "2026-09-30" },
      { description: "AUG FUEL TAX", deductions: 2, period_ending: "2026-10-07" }, // a correction the next week
      { description: "CARD FEE", deductions: 10, period_ending: "2026-10-28" },
      { description: "JUL FUEL TAX", deductions: null, period_ending: "2026-08-26" },
    ]);
    expect(rows).toEqual([
      { month: "2026-09", amount: 91, settlementEnding: "2026-10-28" },
      { month: "2026-08", amount: 60, settlementEnding: "2026-10-07" },
      { month: "2026-07", amount: 0, settlementEnding: "2026-08-26" },
    ]);
  });

  it("empty in, empty out", () => {
    expect(fuelTaxByMonth([])).toEqual([]);
  });
});
