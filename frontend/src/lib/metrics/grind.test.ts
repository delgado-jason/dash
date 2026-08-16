import { describe, it, expect } from "vitest";
import {
  classify,
  currentStreakOf,
  bestStreakOf,
  computePersonalGrind,
  type WeekStatus,
} from "./grind";
import type { Load } from "@/types/load";

// A delivered load worth `gross`, keyed to a delivery week.
const deliv = (date: string, gross: number) =>
  ({
    load_status: "delivered",
    delivery_date: date,
    linehaul: gross,
    fuel_surcharge: 0,
    total_accessorials: 0,
    booked_by: "u1",
  } as unknown as Load);

const targets = {
  weeklyBreakEven: 5447,
  weeklyTarget: 7353,
  dailyBreakEven: null,
  dailyTarget: null,
};

describe("classify", () => {
  it("grades a week's gross against the weekly pace targets", () => {
    expect(classify(0, targets)).toBe("home");
    expect(classify(9404, targets)).toBe("target"); // beat target
    expect(classify(7353, targets)).toBe("target");
    expect(classify(6000, targets)).toBe("breakeven"); // covered the floor
    expect(classify(2600, targets)).toBe("below");
  });
});

describe("currentStreakOf", () => {
  const S = (a: WeekStatus[]) => currentStreakOf(a);
  it("counts trailing target weeks", () => {
    expect(S(["below", "target", "target", "target"])).toBe(3);
  });
  it("skips home weeks without breaking", () => {
    expect(S(["target", "target", "home", "target"])).toBe(3);
    expect(S(["target", "target", "home", "home"])).toBe(2);
  });
  it("breaks on a below or break-even week", () => {
    expect(S(["target", "breakeven", "target", "target"])).toBe(2);
    expect(S(["target", "below"])).toBe(0);
  });
});

describe("bestStreakOf", () => {
  it("finds the longest target run, home weeks neutral", () => {
    expect(bestStreakOf(["target", "target", "below", "target", "target", "target"])).toBe(3);
    expect(bestStreakOf(["target", "home", "target"])).toBe(2);
    expect(bestStreakOf(["below", "breakeven", "home"])).toBe(0);
  });
});

describe("computePersonalGrind — graded against her own typical week", () => {
  it("streaks the weeks at/above 75% of her typical, a slow week breaks it", () => {
    // typical (median of active) = 9000 → bar 6750, floor 3600.
    const loads = [
      deliv("2026-01-01", 10000),
      deliv("2026-01-08", 10000),
      deliv("2026-01-15", 10000),
      deliv("2026-01-22", 2000), // below floor → breaks the streak
      deliv("2026-01-29", 9000),
      deliv("2026-02-05", 9000),
      deliv("2026-02-12", 9000),
      deliv("2026-02-19", 8000),
    ];
    const g = computePersonalGrind(loads, new Date("2026-03-04T12:00:00Z"));
    expect(g.hasLadder).toBe(true);
    expect(g.currentStreak).toBe(4); // the four weeks after the slow one
    expect(g.bestStreak).toBe(4);
    expect(g.thisWeek).toBe("home"); // nothing delivered in the current week
  });

  it("needs a few active weeks before a bar is meaningful", () => {
    const g = computePersonalGrind(
      [deliv("2026-02-05", 9000), deliv("2026-02-12", 9000)],
      new Date("2026-03-04T12:00:00Z"),
    );
    expect(g.hasLadder).toBe(false); // < 3 active weeks
    expect(g.currentStreak).toBe(0);
  });

  it("degrades cleanly with no delivered freight", () => {
    const g = computePersonalGrind([], new Date("2026-03-04T12:00:00Z"));
    expect(g.hasLadder).toBe(false);
    expect(g.weeks).toEqual([]);
  });

  it("reads 'typical' from the trailing quarter, not all-time (seasonal)", () => {
    // Old huge weeks (outside the 13-week window) must NOT set the bar. If they
    // did, the bar would be ~15000 and her recent $6k weeks would read 'below'
    // (streak 0). Windowed, the bar is 4500 and the recent weeks streak.
    const loads = [
      deliv("2025-12-03", 20000),
      deliv("2025-12-10", 20000),
      deliv("2025-12-17", 20000),
      deliv("2025-12-24", 20000),
      deliv("2026-05-13", 6000),
      deliv("2026-05-20", 6000),
      deliv("2026-05-27", 6000),
    ];
    const g = computePersonalGrind(loads, new Date("2026-06-03T12:00:00Z"));
    expect(g.hasLadder).toBe(true);
    expect(g.currentStreak).toBeGreaterThanOrEqual(3); // recent weeks count as target
  });
});
