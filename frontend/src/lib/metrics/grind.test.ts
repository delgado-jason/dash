import { describe, it, expect } from "vitest";
import {
  classify,
  currentStreakOf,
  bestStreakOf,
  type WeekStatus,
} from "./grind";

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
