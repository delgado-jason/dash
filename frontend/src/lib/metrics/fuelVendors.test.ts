import { describe, it, expect } from "vitest";
import { canonicalVendor, vendorLines } from "./fuelVendors";

describe("canonicalVendor", () => {
  it("folds the three chains' spellings on Jason's book", () => {
    for (const v of ["TA·Petro", "TA", "Petro", "ta", "TA Petro", "TravelCenters of America", "Petro Stopping Center"])
      expect(canonicalVendor(v)).toBe("TA·Petro");
    for (const v of ["Love's", "Loves", "loves", "Love’s Travel Stop"]) expect(canonicalVendor(v)).toBe("Love's");
    for (const v of ["Pilot Flying J", "Pilot", "pilot", "Flying J", "Pilot Travel Center"]) expect(canonicalVendor(v)).toBe("Pilot Flying J");
  });

  it("leaves a stranger as typed, trimmed, and blanks as null", () => {
    expect(canonicalVendor("  Chubbys ")).toBe("Chubbys");
    expect(canonicalVendor("Sapp Bros")).toBe("Sapp Bros");
    expect(canonicalVendor("")).toBeNull();
    expect(canonicalVendor("   ")).toBeNull();
    expect(canonicalVendor(null)).toBeNull();
    expect(canonicalVendor(undefined)).toBeNull();
  });
});

describe("vendorLines", () => {
  it("groups diesel fills by the canonical vendor, most gallons first, no-vendor last, DEF left out", () => {
    const rows = vendorLines([
      { company_name: "TA", gallons: 100, price_per_gallon: 5 },
      { company_name: "Petro", gallons: 100, price_per_gallon: 5.1 },
      { company_name: "Loves", gallons: 150, price_per_gallon: 5.3 },
      { company_name: null, gallons: 50, price_per_gallon: 4 },
      { company_name: "Love's", gallons: 10, price_per_gallon: 3, kind: "def" },
      { company_name: "Chubbys", gallons: 8, price_per_gallon: 5.4 },
    ]);
    expect(rows.map((r) => r.vendor)).toEqual(["TA·Petro", "Love's", "Chubbys", null]);
    expect(rows[0]).toMatchObject({ fills: 2, gallons: 200 });
    expect(rows[0].ppg).toBeCloseTo(5.05, 5);
    expect(rows[1]).toMatchObject({ fills: 1, gallons: 150 });
    expect(rows[1].ppg).toBeCloseTo(5.3, 5);
    expect(rows[3]).toMatchObject({ vendor: null, fills: 1, gallons: 50 });
  });

  it("empty in, empty out; a zero-gallon fill has no price", () => {
    expect(vendorLines([])).toEqual([]);
    expect(vendorLines([{ company_name: "TA", gallons: 0, price_per_gallon: 5 }])[0].ppg).toBeNull();
  });
});
