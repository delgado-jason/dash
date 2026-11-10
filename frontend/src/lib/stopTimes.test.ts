import { describe, it, expect } from "vitest";
import { fmtTime, dwell, dwellMinutes, stopAnchorMin } from "./stopTimes";

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

// Jason's rule, 2026-11-10: "I can't penalize facilities for arriving early
// with high dwell times. The dwell time starts just like how my detention time
// would start." One anchor serves both numbers — see lib/detention for the
// claimable half, whose tests name this file.
describe("stopAnchorMin — the clock starts at the later of arrival and appointment", () => {
  it("a HARD appointment holds the clock back when the truck is early", () => {
    expect(stopAnchorMin("06:00", "09:00")).toBe(9 * 60); // 09:00, not 06:00
  });
  it("an on-time or late arrival anchors on the ARRIVAL", () => {
    expect(stopAnchorMin("09:00", "09:00")).toBe(9 * 60);
    expect(stopAnchorMin("09:44", "08:00")).toBe(9 * 60 + 44);
  });
  it("with no appointment there is nothing to wait for — the arrival anchors it", () => {
    expect(stopAnchorMin("06:00", null)).toBe(6 * 60);
  });
  it("is null with no arrival at all", () => {
    expect(stopAnchorMin(null, "09:00")).toBeNull();
  });
});

describe("dwellMinutes — what the stop actually cost, not what the driver chose", () => {
  it("does NOT charge a facility for an early arrival", () => {
    // Load 2543056's shipper: 07:45 appointment, rolled in 05:15, out 13:45.
    // 8h30m on the property, but 2h30m of it was his own early start.
    expect(dwellMinutes("05:15", "13:45", "07:45")).toBe(360); // 6h, not 8h30m
    expect(dwellMinutes("05:15", "13:45")).toBe(510);          // unanchored, for contrast
  });

  it("clamps at zero when the dock released the truck before its appointment", () => {
    // Load 6913105's receiver: 12:00 appointment, in 09:47, out 10:12. They did
    // him a favour; a negative dwell would have scored it as time handed back.
    expect(dwellMinutes("09:47", "10:12", "12:00")).toBe(0);
  });

  it("counts from arrival once the appointment has passed", () => {
    expect(dwellMinutes("09:44", "12:30", "08:00")).toBe(166);
  });

  it("still rolls past midnight, judging the wrap on the ARRIVAL", () => {
    // In 22:00 against a 23:00 appointment, out 01:30 → clock from 23:00.
    expect(dwellMinutes("22:00", "01:30", "23:00")).toBe(150);
    // And with no appointment, the whole stretch counts.
    expect(dwellMinutes("22:00", "01:30")).toBe(210);
  });

  it("is null unless both ends are recorded", () => {
    expect(dwellMinutes("08:00", null, "08:00")).toBeNull();
    expect(dwellMinutes(null, "10:00", "08:00")).toBeNull();
  });
});
