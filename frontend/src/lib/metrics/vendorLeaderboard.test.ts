import { describe, it, expect } from "vitest";
import {
  groupVendorsByCategory,
  trustCounts,
  serviceAreaStates,
} from "./vendorLeaderboard";
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

describe("trustCounts", () => {
  it("splits the roster into go-to / steer-clear / unproven; 3-4s count nowhere", () => {
    expect(
      trustCounts([
        v({ rating: 5 }),
        v({ rating: 5 }),
        v({ rating: 4 }),
        v({ rating: 3 }),
        v({ rating: 2 }),
        v({ rating: 1 }),
        v({ rating: null }),
      ]),
    ).toEqual({ goTo: 2, steerClear: 2, unproven: 1 });
  });

  it("is all zeros for an empty roster", () => {
    expect(trustCounts([])).toEqual({ goTo: 0, steerClear: 0, unproven: 0 });
  });
});

describe("serviceAreaStates", () => {
  it("parses a messy real-world list — trailing comma and all", () => {
    expect(serviceAreaStates("TX, AL, GA, SC, NC,")).toEqual([
      "TX",
      "AL",
      "GA",
      "SC",
      "NC",
    ]);
  });

  it("uppercases, dedupes, and drops non-state tokens instead of guessing", () => {
    // "and" and "to" are word tokens that must not become chips; the repeat
    // mention of TX collapses.
    expect(serviceAreaStates("tx and OK; TX to southeast")).toEqual(["TX", "OK"]);
  });

  it("returns nothing for null or blank", () => {
    expect(serviceAreaStates(null)).toEqual([]);
    expect(serviceAreaStates("  ")).toEqual([]);
  });
});
