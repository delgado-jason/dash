import { describe, it, expect } from "vitest";
import { sitRunCosts, DAYS_PER_MONTH, WEEKS_PER_MONTH } from "./sitRun";

describe("sitRunCosts", () => {
  it("sit is fixed + notes; run adds the variable burn", () => {
    // July-shaped numbers: fixed 11,347 + notes 1,960; variable 7,911.
    const c = sitRunCosts(11347, 7911, 1960);
    expect(c.sitMonthly).toBe(13307);
    expect(c.runMonthly).toBe(21218);
    expect(c.sitDaily).toBeCloseTo(13307 / DAYS_PER_MONTH, 5);
    expect(c.sitWeekly).toBeCloseTo(13307 / WEEKS_PER_MONTH, 5);
    expect(c.runDaily).toBeCloseTo(21218 / DAYS_PER_MONTH, 5);
    expect(c.runWeekly).toBeCloseTo(21218 / WEEKS_PER_MONTH, 5);
  });

  it("run/week equals the page's weekly-cost convention by construction", () => {
    const c = sitRunCosts(10000, 5000, 2000);
    expect(c.runWeekly).toBeCloseTo(17000 / WEEKS_PER_MONTH, 5);
  });

  it("the road delta is the variable burn per day", () => {
    const c = sitRunCosts(9000, 6088, 0);
    expect(c.roadDaily).toBeCloseTo(6088 / DAYS_PER_MONTH, 5);
    expect(c.runDaily - c.sitDaily).toBeCloseTo(c.roadDaily, 5);
  });

  it("zeros stay zeros — no notes, no variable, nothing invented", () => {
    const c = sitRunCosts(0, 0, 0);
    expect(c.sitDaily).toBe(0);
    expect(c.runWeekly).toBe(0);
    expect(c.roadDaily).toBe(0);
  });
});
