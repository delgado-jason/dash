import { describe, it, expect } from "vitest";
import {
  toInches,
  toFeetInches,
  formatInches,
  formatLoadDims,
  isOverWidth,
  classifyOversize,
  freightCeilingLb,
  grossFromFreight,
} from "./dimensions";

describe("toInches / toFeetInches", () => {
  it("converts feet + inches to total inches", () => {
    expect(toInches(40, 0)).toBe(480);
    expect(toInches(12, 4)).toBe(148);
    expect(toInches(3, 7)).toBe(43);
  });

  it("splits inches back into feet and inches", () => {
    expect(toFeetInches(148)).toEqual({ feet: 12, inches: 4 });
    expect(toFeetInches(43)).toEqual({ feet: 3, inches: 7 });
    expect(toFeetInches(480)).toEqual({ feet: 40, inches: 0 });
  });

  it("round-trips any feet/inches pair", () => {
    for (const [f, i] of [
      [51, 5],
      [10, 11],
      [0, 7],
    ]) {
      expect(toFeetInches(toInches(f, i))).toEqual({ feet: f, inches: i });
    }
  });
});

describe("formatInches", () => {
  it('formats inches as feet-inches', () => {
    expect(formatInches(148)).toBe("12'4\"");
    expect(formatInches(480)).toBe("40'0\"");
  });

  it("returns null for null/undefined", () => {
    expect(formatInches(null)).toBeNull();
    expect(formatInches(undefined)).toBeNull();
  });
});

describe("formatLoadDims", () => {
  it("joins all three dimensions in L · W · H order", () => {
    expect(formatLoadDims(480, 148, 94)).toBe("40'0\" L · 12'4\" W · 7'10\" H");
  });

  it("shows only the dimensions that are set", () => {
    expect(formatLoadDims(null, 148, null)).toBe("12'4\" W");
  });

  it("returns null when the load has no dimensions (a legal load)", () => {
    expect(formatLoadDims(null, null, null)).toBeNull();
    expect(formatLoadDims()).toBeNull();
  });
});

describe("isOverWidth", () => {
  it("is true only above the 102-inch legal width", () => {
    expect(isOverWidth(148)).toBe(true);
    expect(isOverWidth(103)).toBe(true);
    expect(isOverWidth(102)).toBe(false); // exactly legal
    expect(isOverWidth(96)).toBe(false);
    expect(isOverWidth(null)).toBe(false);
    expect(isOverWidth(undefined)).toBe(false);
  });
});

describe("classifyOversize", () => {
  it("legal when everything is within limits", () => {
    const v = classifyOversize({ widthIn: 102, heightIn: 162, lengthIn: 636, grossWeightLb: 80000 });
    expect(v.oversize).toBe(false);
    expect(v.reasons).toEqual([]);
  });

  it("legal when nothing is entered", () => {
    expect(classifyOversize({}).oversize).toBe(false);
  });

  it("flags over-width and names it", () => {
    const v = classifyOversize({ widthIn: 144 }); // 12'0"
    expect(v.oversize).toBe(true);
    expect(v.reasons).toEqual([`width 12'0" over 8'6"`]);
  });

  it("flags every dimension that's over, in order", () => {
    const v = classifyOversize({ widthIn: 144, heightIn: 168, lengthIn: 700, grossWeightLb: 92000 });
    expect(v.oversize).toBe(true);
    expect(v.reasons).toHaveLength(4);
    expect(v.reasons[1]).toBe(`height 14'0" over 13'6"`);
    expect(v.reasons[3]).toBe("92,000 lb over 80,000 lb");
  });

  it("is exclusive at the limit — exactly legal is not oversize", () => {
    expect(classifyOversize({ widthIn: 102, grossWeightLb: 80000 }).oversize).toBe(false);
    expect(classifyOversize({ widthIn: 103 }).oversize).toBe(true);
  });
});

describe("freightCeilingLb / grossFromFreight — the weight box's real question", () => {
  it("JASON'S 48,000 RULE IS 80,000 MINUS WHAT HE SCALES EMPTY", () => {
    // His "anything over 48,000 is heavy" and the legal 80,000 gross are the
    // same line said twice. Derived, it follows the equipment instead of
    // sitting stale in a constant.
    expect(freightCeilingLb(32000)).toBe(48000);
    // Hook a heavier trailer and the heavy line moves on its own.
    expect(freightCeilingLb(34500)).toBe(45500);
  });

  it("NO TARE, NO CEILING — a guess here is the original bug", () => {
    // Guessing a tare is how a 52,000 lb load read as legal and got priced on
    // the Standard ladder: 85c a driven mile under-asked, silently.
    expect(freightCeilingLb(null)).toBeNull();
    expect(freightCeilingLb(undefined)).toBeNull();
    expect(freightCeilingLb(0)).toBeNull();
    expect(freightCeilingLb(-100)).toBeNull();
    expect(freightCeilingLb(80000)).toBeNull(); // no room for freight at all
  });

  it("the agent's number plus your tare is the gross the routing API wants", () => {
    expect(grossFromFreight(52000, 32000)).toBe(84000);
    // and it IS over legal, which is the whole point
    expect(classifyOversize({ grossWeightLb: grossFromFreight(52000, 32000) }).oversize).toBe(true);
  });

  it("a half-known gross is no gross — null rather than a number built on a guess", () => {
    expect(grossFromFreight(52000, null)).toBeNull();
    expect(grossFromFreight(null, 32000)).toBeNull();
    expect(grossFromFreight(0, 32000)).toBeNull();
  });

  it("the ceiling and the gross agree about what is heavy", () => {
    const empty = 32000;
    const ceiling = freightCeilingLb(empty)!;
    for (const freight of [10000, 47999, 48000, 48001, 52000]) {
      const overByCeiling = freight > ceiling;
      const overByGross = grossFromFreight(freight, empty)! > 80000;
      expect(overByCeiling).toBe(overByGross);
    }
  });
});
