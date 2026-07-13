import { describe, it, expect } from "vitest";
import { fmtTime, dwell } from "./stopTimes";

describe("fmtTime", () => {
  it("formats morning, noon, and evening times", () => {
    expect(fmtTime("08:30:00")).toBe("8:30a");
    expect(fmtTime("12:05:00")).toBe("12:05p");
    expect(fmtTime("22:00:00")).toBe("10:00p");
    expect(fmtTime("00:15:00")).toBe("12:15a");
  });

  it("accepts times without seconds", () => {
    expect(fmtTime("06:00")).toBe("6:00a");
  });

  it("returns a dash for a missing time", () => {
    expect(fmtTime(null)).toBe("—");
    expect(fmtTime(undefined)).toBe("—");
  });
});

describe("dwell", () => {
  it("computes a same-day stay", () => {
    expect(dwell("08:30", "10:45")).toBe("2h 15m");
  });

  it("drops the minutes when it's a whole number of hours", () => {
    expect(dwell("06:00", "07:00")).toBe("1h");
  });

  it("shows minutes only under an hour", () => {
    expect(dwell("06:00", "06:40")).toBe("40m");
  });

  it("rolls a day when the stop ran past midnight", () => {
    expect(dwell("22:00", "01:30")).toBe("3h 30m");
  });

  it("is null unless both times are present", () => {
    expect(dwell("08:00", null)).toBeNull();
    expect(dwell(null, "10:00")).toBeNull();
    expect(dwell(null, null)).toBeNull();
  });

  it("is null for a zero-length stay", () => {
    expect(dwell("09:00", "09:00")).toBeNull();
  });
});
