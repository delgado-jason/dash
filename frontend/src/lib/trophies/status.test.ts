import { describe, it, expect } from "vitest";
import type { Trophy } from "@/types/trophy";
import { TROPHY_CATALOG } from "./catalog";
import { computeAllStatuses } from "./status";

const rec = (key: string, earned: boolean): Trophy => ({
  trophy_key: key,
  earned,
  earned_on: null,
  image_url: null,
  notes: null,
});

describe("computeAllStatuses", () => {
  it("computes data-driven progress and earned", () => {
    const s = computeAllStatuses(TROPHY_CATALOG, {}, {
      lifetimeMiles: 582_450,
      driverCount: 1,
      truckCount: 1,
      cumulativeGross: 174_000,
    });
    expect(s["million-mile-club"].earned).toBe(false);
    expect(s["million-mile-club"].progress).toBeCloseTo(0.582, 2);
    expect(s["second-truck"].earned).toBe(false);
    expect(s["five-truck-fleet"].progress).toBeCloseTo(0.2, 2);
    expect(s["one-million-hauled"].earned).toBe(false);
    expect(s["one-million-hauled"].progress).toBeCloseTo(0.174, 2);
  });

  it("reads manual trophies from the record", () => {
    const s = computeAllStatuses(TROPHY_CATALOG, { "owner-operator": rec("owner-operator", true) }, {
      lifetimeMiles: 0,
      driverCount: 1,
      truckCount: 1,
      cumulativeGross: 0,
    });
    expect(s["owner-operator"].earned).toBe(true);
    expect(s["own-authority"].earned).toBe(false);
  });

  it("Highway Legend is the capstone of authority + free-and-clear + million miles", () => {
    const base = {
      "own-authority": rec("own-authority", true),
      "free-and-clear": rec("free-and-clear", true),
    };
    const notYet = computeAllStatuses(TROPHY_CATALOG, base, {
      lifetimeMiles: 900_000,
      driverCount: 1,
      truckCount: 1,
      cumulativeGross: 0,
    });
    expect(notYet["highway-legend"].earned).toBe(false); // miles short
    expect(notYet["highway-legend"].progress).toBeCloseTo(2 / 3, 2);

    const done = computeAllStatuses(TROPHY_CATALOG, base, {
      lifetimeMiles: 1_000_000,
      driverCount: 1,
      truckCount: 1,
      cumulativeGross: 0,
    });
    expect(done["highway-legend"].earned).toBe(true);
  });
});
