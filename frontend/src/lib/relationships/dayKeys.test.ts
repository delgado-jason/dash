import { describe, it, expect } from "vitest";
import { utcDayKey, localDayKey, keyOf, daysBetweenKeys, shortDate } from "./dayKeys";

describe("shortDate — the row's 'Aug 31'", () => {
  it("reads the day off a DATE that arrives as a timestamp, and off a bare day key", () => {
    expect(shortDate("2026-08-31T05:00:00.000Z")).toBe("Aug 31");
    expect(shortDate("2026-08-31")).toBe("Aug 31");
  });

  it("formats in UTC — late-evening UTC never shifts to the next day", () => {
    expect(shortDate("2026-08-31T23:30:00.000Z")).toBe("Aug 31");
  });

  it("null and undefined in → null out (the UI decides what to print)", () => {
    expect(shortDate(null)).toBeNull();
    expect(shortDate(undefined)).toBeNull();
    expect(shortDate("")).toBeNull();
  });
});

describe("keyOf / daysBetweenKeys — UTC-anchored calendar days", () => {
  it("keyOf slices the day from any API string", () => {
    expect(keyOf("2026-08-31T05:00:00.000Z")).toBe("2026-08-31");
    expect(keyOf("2026-08-31")).toBe("2026-08-31");
  });

  it("counts whole days across the spring DST change — no 23-hour day leaks in", () => {
    // US clocks spring forward on 2026-03-08; a local diff would read 1.96 days.
    expect(daysBetweenKeys("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetweenKeys("2026-03-08", "2026-03-09")).toBe(1);
  });

  it("is signed and zero on the same day", () => {
    expect(daysBetweenKeys("2026-09-12", "2026-09-12")).toBe(0);
    expect(daysBetweenKeys("2026-09-12", "2026-09-10")).toBe(-2);
    expect(daysBetweenKeys("2025-12-31", "2026-01-01")).toBe(1);
  });
});

describe("localDayKey vs utcDayKey — two clocks on purpose", () => {
  it("localDayKey is the calendar on the wall, whatever the zone", () => {
    expect(localDayKey(new Date(2026, 8, 12, 23, 30))).toBe("2026-09-12");
    expect(localDayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });

  it("utcDayKey is the ISO day of the instant", () => {
    expect(utcDayKey(new Date("2026-09-13T03:30:00.000Z"))).toBe("2026-09-13");
  });

  it("late in the local evening the two disagree exactly when local time runs behind UTC", () => {
    // 23:30 on the wall: west of UTC (Brandie's Central, this Mac's Eastern)
    // toISOString is already tomorrow; at or east of UTC it is still today.
    // The relationship is asserted rather than the zone assumed, so the test
    // holds on any machine and still proves the two keys are different clocks.
    const lateLocal = new Date(2026, 8, 12, 23, 30);
    const behindUtc = lateLocal.getTimezoneOffset() > 30; // minutes UTC is ahead of local
    expect(localDayKey(lateLocal)).toBe("2026-09-12");
    expect(utcDayKey(lateLocal) !== localDayKey(lateLocal)).toBe(behindUtc);
    if (behindUtc) expect(utcDayKey(lateLocal)).toBe("2026-09-13");
  });
});
