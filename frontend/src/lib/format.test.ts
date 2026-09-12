import { describe, it, expect } from "vitest";
import { daysBetween } from "./format";

describe("daysBetween", () => {
  it("counts whole days between bare YYYY-MM-DD dates", () => {
    expect(daysBetween("2026-07-20", "2026-07-23")).toBe(3);
    expect(daysBetween("2026-07-20", "2026-07-21")).toBe(1);
  });

  it("gives the same answer for the API's full-ISO shape", () => {
    expect(
      daysBetween("2026-07-20T04:00:00.000Z", "2026-07-23T04:00:00.000Z"),
    ).toBe(3);
    expect(daysBetween("2026-07-20T04:00:00.000Z", "2026-07-23")).toBe(3);
  });

  it("returns 0 for same-day pickup and delivery, not null", () => {
    expect(daysBetween("2026-07-20", "2026-07-20")).toBe(0);
    expect(
      daysBetween("2026-07-20T04:00:00.000Z", "2026-07-20T04:00:00.000Z"),
    ).toBe(0);
  });

  it("returns null when either date is missing", () => {
    expect(daysBetween(null, "2026-07-20")).toBeNull();
    expect(daysBetween("2026-07-20", null)).toBeNull();
    expect(daysBetween(undefined, "2026-07-20")).toBeNull();
    expect(daysBetween("2026-07-20", undefined)).toBeNull();
    expect(daysBetween("", "2026-07-20")).toBeNull();
    expect(daysBetween("2026-07-20", "")).toBeNull();
    expect(daysBetween(null, null)).toBeNull();
    expect(daysBetween()).toBeNull();
  });

  it("crosses a month boundary", () => {
    expect(daysBetween("2026-08-30", "2026-09-02")).toBe(3);
  });

  it("crosses the spring DST change without gaining or losing a day", () => {
    expect(daysBetween("2026-03-07", "2026-03-10")).toBe(3);
  });

  it("crosses the fall DST change without gaining or losing a day", () => {
    expect(daysBetween("2026-10-31", "2026-11-03")).toBe(3);
  });

  it("crosses a year boundary", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});
