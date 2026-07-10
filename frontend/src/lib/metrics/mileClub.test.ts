import { describe, it, expect } from "vitest";
import { mileMilestone, fmtMiles } from "./mileClub";

describe("fmtMiles", () => {
  it("formats K and M markers", () => {
    expect(fmtMiles(100000)).toBe("100K");
    expect(fmtMiles(500000)).toBe("500K");
    expect(fmtMiles(1000000)).toBe("1M");
    expect(fmtMiles(1500000)).toBe("1.5M");
  });
});

describe("mileMilestone", () => {
  it("awards no club under 100K, but tracks progress to it", () => {
    const m = mileMilestone(80000);
    expect(m.crossed).toBeNull();
    expect(m.tier).toBeNull();
    expect(m.next).toBe(100000);
    expect(m.pct).toBeCloseTo(0.8);
  });

  it("reads Workhorse (gold) at 568,737 with progress to the 1M club", () => {
    const m = mileMilestone(568737);
    expect(m.crossed).toBe(500000);
    expect(m.tier).toBe("gold");
    expect(m.title).toBe("Workhorse");
    expect(m.label).toBe("500K");
    expect(m.next).toBe(1000000);
    expect(m.toNext).toBe(431263);
    expect(m.pct).toBeCloseTo((568737 - 500000) / 500000);
  });

  it("reads Road Warrior (silver) closing on the 500K club", () => {
    const m = mileMilestone(456123);
    expect(m.tier).toBe("silver");
    expect(m.label).toBe("250K");
    expect(m.next).toBe(500000);
  });

  it("stays Million-Miler past 1M with a +500K next marker", () => {
    const m = mileMilestone(1200000);
    expect(m.tier).toBe("platinum");
    expect(m.title).toBe("Million-Miler");
    expect(m.label).toBe("1M");
    expect(m.next).toBe(1500000);
  });
});
