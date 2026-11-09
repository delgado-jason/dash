import { describe, it, expect } from "vitest";
import { classify, bestStreakOf, quarterWeekVerdicts } from "./grind";
import type { Load } from "@/types/load";

// A delivered load worth `gross`, keyed to a delivery week.
const deliv = (date: string, gross: number, extra: Record<string, unknown> = {}) =>
  ({
    load_status: "delivered",
    delivery_date: date,
    linehaul: gross,
    fuel_surcharge: 0,
    total_accessorials: 0,
    booked_by: "u1",
    ...extra,
  } as unknown as Load);

const targets = {
  weeklyBreakEven: 5447,
  weeklyTarget: 7353,
  dailyBreakEven: null,
  dailyTarget: null,
  dailyBreakEvenCalendar: null,
  dailyTargetCalendar: null,
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

describe("bestStreakOf", () => {
  it("finds the longest target run, home weeks neutral", () => {
    expect(bestStreakOf(["target", "target", "below", "target", "target", "target"])).toBe(3);
    expect(bestStreakOf(["target", "home", "target"])).toBe(2);
    expect(bestStreakOf(["below", "breakeven", "home"])).toBe(0);
  });
});

describe("quarterWeekVerdicts — the quarter's weeks as one plain count (call 11, B1)", () => {
  // Pay weeks run Wednesday → Tuesday. Q4 2026 starts Thu Oct 1; the first
  // pay week STARTING inside it is Wed Oct 7. now = Sun Nov 8 (the week of
  // Wed Nov 4 is in progress and never counts). Completed weeks that started in
  // the quarter: Oct 7, Oct 14, Oct 21, Oct 28 — four.
  const now = new Date("2026-11-08T12:00:00Z");
  const loads = [
    deliv("2026-10-08", 8000), // week of Oct 7 → at target
    deliv("2026-10-16", 6000), // week of Oct 14 → over the floor, under target
    deliv("2026-10-22", 3000), // week of Oct 21 → below the floor
    // week of Oct 28 → nothing delivered: a home week
    deliv("2026-11-05", 9000), // the week in progress — never counts
    deliv("2026-09-30", 9000), // Q3's last week (started Sep 30) — not this quarter
  ];

  it("counts completed weeks with freight, grades each against the meter's bars, names the home weeks", () => {
    const v = quarterWeekVerdicts(loads, targets, now);
    expect(v.label).toBe("Q4 2026");
    expect(v.counted).toBe(3);
    expect(v.overFloor).toBe(2);
    expect(v.atTarget).toBe(1);
    expect(v.home).toBe(1);
    expect(v.hasBars).toBe(true);
  });

  it("a TONU or a cancelled load in a week moves nothing (never-revenue is not freight)", () => {
    const withTonu = [
      ...loads,
      deliv("2026-10-29", 2500, { load_status: "tonu" }), // the home week stays home
      deliv("2026-10-23", 5000, { load_status: "cancelled" }), // Oct 21 stays below
    ];
    const v = quarterWeekVerdicts(withTonu, targets, now);
    expect(v).toEqual(quarterWeekVerdicts(loads, targets, now));
  });

  it("a week booked but not delivered is not earned: it does not count", () => {
    const v = quarterWeekVerdicts(
      [...loads, deliv("2026-10-30", 9000, { load_status: "in_transit" })],
      targets,
      now,
    );
    expect(v.home).toBe(1);
    expect(v.counted).toBe(3);
  });

  it("no floor and no target (no P&L yet) grades nothing, but still counts the weeks", () => {
    const v = quarterWeekVerdicts(
      loads,
      { ...targets, weeklyBreakEven: null, weeklyTarget: null },
      now,
    );
    expect(v.hasBars).toBe(false);
    expect(v.counted).toBe(3);
    expect(v.overFloor).toBe(0);
    expect(v.atTarget).toBe(0);
  });

  it("the first week of a quarter has nothing completed yet", () => {
    const v = quarterWeekVerdicts(loads, targets, new Date("2026-10-08T12:00:00Z"));
    expect(v.counted).toBe(0);
    expect(v.home).toBe(0);
  });
});
