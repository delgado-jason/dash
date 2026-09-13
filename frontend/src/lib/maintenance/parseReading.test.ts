import { describe, it, expect } from "vitest";
import { parseReading, parseCost } from "./parseReading";

describe("parseReading — the meter box", () => {
  it("keeps the decimal point and truncates (the 10x bug)", () => {
    // The old parser stripped the dot first: 12405 and 5,687,370.
    expect(parseReading("1240.5")).toBe(1240);
    expect(parseReading("568737.0")).toBe(568737);
  });

  it("strips the commas a man types out of habit", () => {
    expect(parseReading("568,737")).toBe(568737);
    expect(parseReading("1,240.5")).toBe(1240);
  });

  it("a blank box is a reading nobody took — null, never 0", () => {
    expect(parseReading("")).toBeNull();
    expect(parseReading("   ")).toBeNull();
  });

  it("nonsense is null, not NaN", () => {
    expect(parseReading("abc")).toBeNull();
  });

  it("a plain whole number survives untouched", () => {
    expect(parseReading("1240")).toBe(1240);
  });
});

describe("parseCost — the money box", () => {
  it("strips $, commas and spaces before parsing", () => {
    expect(parseCost("1,358.70")).toBeCloseTo(1358.7, 5);
    expect(parseCost("$1,358.70")).toBeCloseTo(1358.7, 5);
    expect(parseCost(" 1 358.70 ")).toBeCloseTo(1358.7, 5);
  });

  it("blank → null (no price on this one yet is not $0)", () => {
    expect(parseCost("")).toBeNull();
    expect(parseCost("  ")).toBeNull();
  });

  it("nonsense is null, not NaN", () => {
    expect(parseCost("abc")).toBeNull();
  });
});
