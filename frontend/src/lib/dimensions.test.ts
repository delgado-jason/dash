import { describe, it, expect } from "vitest";
import {
  toInches,
  toFeetInches,
  formatInches,
  formatLoadDims,
  isOverWidth,
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
