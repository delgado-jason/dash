import { describe, it, expect } from "vitest";
import {
  classify,
  currentStreakOf,
  bestStreakOf,
  type WeekStatus,
} from "./grind";

const ladder = { walkAway: 4, minimum: 4.6, target: 6, strong: 6.4 };

describe("classify", () => {
  it("grades a week's rpm against the ladder", () => {
    expect(classify(null, ladder)).toBe("home");
    expect(classify(6.5, ladder)).toBe("target");
    expect(classify(6, ladder)).toBe("target");
    expect(classify(5, ladder)).toBe("breakeven");
    expect(classify(3.5, ladder)).toBe("below");
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
