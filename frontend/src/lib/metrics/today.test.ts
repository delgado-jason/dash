import { describe, it, expect } from "vitest";
import { anchorDay, localToday, localDayKey } from "./today";

describe("today — the local day, anchored for UTC-getter math (call 13)", () => {
  it("anchorDay is UTC midnight of the key, whatever the zone", () => {
    const d = anchorDay("2026-11-04");
    expect(d.toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCDay()]).toEqual([2026, 10, 4, 3]); // a Wednesday
    expect(anchorDay("2026-11-04T23:59:00.000Z").toISOString()).toBe("2026-11-04T00:00:00.000Z"); // slices a timestamp to its day
  });

  it("localToday anchors the LOCAL day key, so its UTC fields read the operator's calendar", () => {
    // 11 pm in the runner's own zone: the local day must survive the trip.
    const late = new Date(2026, 10, 4, 23, 30, 0);
    const key = localDayKey(late);
    expect(key).toBe("2026-11-04");
    const t = localToday(late);
    expect(t.toISOString().slice(0, 10)).toBe(key);
    expect(t.getUTCDate()).toBe(4);
    // whereas the raw Date's UTC day may already be tomorrow west of Greenwich
    expect(t.toISOString().slice(0, 10)).toBe(localDayKey(late));
  });

  it("midnight local is still the same day", () => {
    const first = new Date(2026, 10, 5, 0, 0, 30);
    expect(localToday(first).toISOString().slice(0, 10)).toBe("2026-11-05");
  });
});
