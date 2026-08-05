import { describe, it, expect } from "vitest";
import { groupVendorsByCategory, goToCount } from "./vendorLeaderboard";
import type { Vendor } from "@/types/vendor";

const v = (over: Partial<Vendor>): Vendor => ({
  vendor_id: over.name ?? Math.random().toString(),
  name: over.name ?? "x",
  category: over.category ?? "Shop",
  rating: over.rating ?? null,
  status: "active",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

describe("groupVendorsByCategory", () => {
  it("returns nothing for an empty roster", () => {
    expect(groupVendorsByCategory([])).toEqual([]);
  });

  it("groups by category and sorts categories by name", () => {
    const groups = groupVendorsByCategory([
      v({ name: "A", category: "Shop" }),
      v({ name: "B", category: "Escort / Pilot Car" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["Escort / Pilot Car", "Shop"]);
  });

  it("ranks by rating desc, unrated last, ties broken by name", () => {
    const groups = groupVendorsByCategory([
      v({ name: "Zeta", category: "Shop", rating: 5 }),
      v({ name: "Alpha", category: "Shop", rating: 5 }),
      v({ name: "Mid", category: "Shop", rating: 3 }),
      v({ name: "Unrated", category: "Shop", rating: null }),
    ]);
    expect(groups[0].vendors.map((x) => x.name)).toEqual([
      "Alpha",
      "Zeta",
      "Mid",
      "Unrated",
    ]);
  });

  it("crowns the top-rated vendor as champion (ties broken by name)", () => {
    const groups = groupVendorsByCategory([
      v({ name: "Zeta", category: "Shop", rating: 5 }),
      v({ name: "Alpha", category: "Shop", rating: 5 }),
    ]);
    expect(groups[0].champion?.name).toBe("Alpha");
  });

  it("crowns the best even when it's a modest rating", () => {
    const groups = groupVendorsByCategory([
      v({ name: "Only", category: "Towing", rating: 2 }),
    ]);
    expect(groups[0].champion?.name).toBe("Only");
  });

  it("has no champion when nobody in the category is rated", () => {
    const groups = groupVendorsByCategory([
      v({ name: "A", category: "Parts", rating: null }),
      v({ name: "B", category: "Parts", rating: null }),
    ]);
    expect(groups[0].champion).toBeNull();
  });
});

describe("goToCount", () => {
  it("counts only 5-rated vendors", () => {
    expect(
      goToCount([
        v({ rating: 5 }),
        v({ rating: 5 }),
        v({ rating: 4 }),
        v({ rating: null }),
      ]),
    ).toBe(2);
  });
});
