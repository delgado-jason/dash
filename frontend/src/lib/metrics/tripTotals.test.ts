import { describe, it, expect } from "vitest";
import { tripTotals } from "./tripTotals";
import type { Trip } from "@/types/trip";

// The clock is injected, so no fake timers — every case pins `now` explicitly.
const NOW = new Date(2026, 7, 9); // Aug 9, 2026, local

const trip = (
  trip_date: string,
  trip_purpose: Trip["trip_purpose"],
  odometer_start: number | null,
  odometer_end: number | null,
): Trip =>
  ({ trip_date, trip_purpose, odometer_start, odometer_end }) as Trip;

describe("tripTotals", () => {
  it("groups the year by purpose with miles and counts", () => {
    const t = tripTotals(
      [
        trip("2026-07-06", "repositioning", 100, 183),
        trip("2026-07-27", "repositioning", 500, 544),
        trip("2026-07-13", "home", 200, 362),
        trip("2025-12-30", "home", 1, 999), // prior year — excluded entirely
      ],
      NOW,
    );
    expect(t.byPurpose.repositioning).toEqual({ ytdMi: 127, ytdTrips: 2, monthMi: 0 });
    expect(t.byPurpose.home).toEqual({ ytdMi: 162, ytdTrips: 1, monthMi: 0 });
    expect(t.byPurpose.shop).toBeUndefined();
    expect(t.monthMi).toBe(0);
  });

  it("splits out the current month, per purpose and in total", () => {
    const t = tripTotals(
      [
        trip("2026-08-02", "repositioning", 100, 150),
        trip("2026-08-08", "home", 200, 230),
        trip("2026-07-13", "home", 300, 400), // this year, not this month
      ],
      NOW,
    );
    expect(t.byPurpose.repositioning?.monthMi).toBe(50);
    expect(t.byPurpose.home).toEqual({ ytdMi: 130, ytdTrips: 2, monthMi: 30 });
    expect(t.monthMi).toBe(80);
  });

  it("counts a trip without odometer readings as a trip with 0 mi", () => {
    const t = tripTotals([trip("2026-08-01", "shop", null, null)], NOW);
    expect(t.byPurpose.shop).toEqual({ ytdMi: 0, ytdTrips: 1, monthMi: 0 });
  });

  it("uses the local calendar, not UTC, for the month split", () => {
    // Evening of Aug 31 local is already Sep 1 in UTC — the trip must still
    // land in August's month bucket.
    const t = tripTotals(
      [trip("2026-08-31", "home", 100, 160)],
      new Date(2026, 7, 31, 21, 0, 0),
    );
    expect(t.byPurpose.home?.monthMi).toBe(60);
    expect(t.monthMi).toBe(60);
  });

  it("returns an empty ledger for no trips", () => {
    expect(tripTotals([], NOW)).toEqual({ byPurpose: {}, monthMi: 0 });
  });
});
