import { describe, it, expect } from "vitest";
import { collectReadings, readingAt, backwardsReadings, weekOdometerMiles, readingWords } from "./odometer";

// September's real chain (prod, 2026-09-30): fills, loads, and the readings
// that pin the last three pay weeks.
const fuel = [
  { fuel_date: "2026-09-14", odometer_reading: 600259 },
  { fuel_date: "2026-09-16", odometer_reading: 601069 },
  { fuel_date: "2026-09-17", odometer_reading: 601652 },
  { fuel_date: "2026-09-19", odometer_reading: 602516 },
  { fuel_date: "2026-09-22T00:00:00.000Z", odometer_reading: "603232" },
  { fuel_date: "2026-09-23", odometer_reading: 604001 },
  { fuel_date: "2026-09-27", odometer_reading: 604738 },
];
const loads = [
  { load_number: "8336008", pickup_date: "2026-09-14", delivery_date: "2026-09-17", odometer_start: 599893, odometer_end: 601595 },
  { load_number: "7330381", pickup_date: "2026-09-18", delivery_date: "2026-09-21", odometer_start: 601595, odometer_end: 603224 },
  { load_number: "2990007", pickup_date: "2026-09-22", delivery_date: "2026-09-23", odometer_start: 603229, odometer_end: 603845 },
  { load_number: "7520182", pickup_date: "2026-09-23", delivery_date: "2026-09-24", odometer_start: 603845, odometer_end: 604222 },
  { load_number: "5165757", pickup_date: "2026-09-25", delivery_date: "2026-09-28", odometer_start: 604222, odometer_end: 605222 },
  { load_number: "1380689", pickup_date: "2026-09-29", delivery_date: "2026-10-01", odometer_start: 605222, odometer_end: null },
  { load_number: "dead", load_status: "cancelled", pickup_date: "2026-09-26", delivery_date: "2026-09-27", odometer_start: 700000, odometer_end: 700500 },
];
const trips = [
  { trip_number: 10, trip_date: "2026-08-28", status: "completed", odometer_start: 595263, odometer_end: 595335 },
  { trip_number: 11, trip_date: "2026-09-20", status: "cancelled", odometer_start: 650000, odometer_end: 650100 },
];
const readings = collectReadings(fuel, loads, trips);

describe("collectReadings", () => {
  it("takes every dated reading from fills, loads and trip logs; cancelled ones contribute nothing", () => {
    expect(readings.some((r) => r.reading >= 650000)).toBe(false);
    expect(readings.find((r) => r.source === "trip-end")?.reading).toBe(595335);
    expect(readings.filter((r) => r.date === "2026-09-22").map((r) => r.reading)).toEqual([603229, 603232]);
  });
});

describe("collectReadings — shop visits", () => {
  it("a tractor's shop reading joins the chain; a trailer-only visit reads the hub and stays out", () => {
    const r = collectReadings([], [], [], [
      { service_date: "2026-09-26T00:00:00.000Z", odometer: 604500, unit: "both" },
      { service_date: "2026-09-27", odometer: 999999, unit: "trailer" },
    ]);
    expect(r).toEqual([{ date: "2026-09-26", reading: 604500, source: "service", ref: "2026-09-26" }]);
  });
});

describe("readingAt — the highest reading dated on or before the day", () => {
  it("resolves a same-day pair by value", () => {
    expect(readingAt(readings, "2026-09-22")?.reading).toBe(603232);
    expect(readingAt(readings, "2026-09-29")?.reading).toBe(605222);
    expect(readingAt(readings, "2026-09-15")?.reading).toBe(600259);
  });
  it("is null before the first reading", () => {
    expect(readingAt(readings, "2026-08-01")).toBeNull();
  });
});

describe("weekOdometerMiles — the sheet's numbers", () => {
  it("Sep 23–29: 603,232 → 605,222 = 1,990 mi (the loads said 1,999)", () => {
    const w = weekOdometerMiles(readings, { start: "2026-09-23", end: "2026-09-29" });
    expect(w.miles).toBe(1990);
    expect(readingWords(w.start!)).toBe("603,232 on Sep 22");
    expect(readingWords(w.end!)).toBe("605,222 on Sep 29");
    expect(w.endSlips).toBe(false);
  });
  it("Sep 16–22: 600,259 → 603,232 = 2,973 mi — a load's miles count where they were driven, not in its pickup week", () => {
    expect(weekOdometerMiles(readings, { start: "2026-09-16", end: "2026-09-22" }).miles).toBe(2973);
  });
  it("an open week as of today: the latest reading so far, and it grows as readings land", () => {
    const w = weekOdometerMiles(readings, { start: "2026-09-30", end: "2026-10-06" }, "2026-09-30");
    expect(w.miles).toBe(0);
    expect(w.end?.date).toBe("2026-09-29");
    expect(w.endSlips).toBe(true);
  });
  it("a closed week whose last reading came early says so — the miles since ride into next week", () => {
    const short = readings.filter((r) => r.date <= "2026-09-27");
    const w = weekOdometerMiles(short, { start: "2026-09-23", end: "2026-09-29" });
    expect(w.miles).toBe(604738 - 603232);
    expect(w.endSlips).toBe(true);
  });
  it("no reading before the week → null, so the caller falls back to the loads", () => {
    expect(weekOdometerMiles(readings, { start: "2026-08-05", end: "2026-08-11" }).miles).toBeNull();
  });
});

describe("backwardsReadings — a typo never lowers the chain", () => {
  it("flags a reading below an earlier higher one and keeps the higher", () => {
    const typo = collectReadings([...fuel, { fuel_date: "2026-09-25", odometer_reading: 60422 }], loads, []);
    const bad = backwardsReadings(typo);
    expect(bad.map((r) => r.reading)).toEqual([60422]);
    expect(readingAt(typo, "2026-09-25")?.reading).toBe(604222);
    const w = weekOdometerMiles(typo, { start: "2026-09-23", end: "2026-09-29" });
    expect(w.miles).toBe(1990);
    expect(w.backwards.length).toBe(1);
  });
  it("a clean chain has none", () => {
    expect(backwardsReadings(readings)).toEqual([]);
  });
});
