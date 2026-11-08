import { describe, it, expect } from "vitest";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { MaintenanceService } from "@/types/maintenance";
import { truckReadings, truckReadingOnOrBefore, trailerReadingToday, meterWords, shortDay } from "./trailerMeter";

const fill = (fuel_date: string, odometer_reading: number) =>
  ({ fuel_date, odometer_reading, gallons: 120, price_per_gallon: 4, filled_to_top: true }) as unknown as FuelEntry;
const load = (o: Partial<Load>) => ({ load_status: "delivered", ...o }) as unknown as Load;
const trip = (o: Partial<Trip>) => ({ status: "completed", trip_purpose: "home", ...o }) as unknown as Trip;
const svc = (o: Partial<MaintenanceService>) => o as unknown as MaintenanceService;

const READINGS = truckReadings(
  [fill("2026-09-11", 599431), fill("2026-11-07", 606217)],
  [
    load({ load_number: "1572011", pickup_date: "2026-09-28", delivery_date: "2026-10-01", odometer_start: 601000, odometer_end: 601820 }),
    load({ load_number: "9999999", load_status: "cancelled", delivery_date: "2026-10-03", odometer_end: 999999 }), // never a reading
  ],
  [trip({ trip_date: "2026-08-11", odometer_start: 511469, odometer_end: 512034 }), trip({ trip_date: "2026-10-20", status: "cancelled", odometer_end: 777777 })],
  [svc({ unit: "both", service_date: "2026-08-28", odometer: 595263 }), svc({ unit: "trailer", service_date: "2026-09-13", odometer: null, trailer_hub: 599431 }), svc({ unit: "apu", service_date: "2026-10-01", odometer: 900000 })],
);

describe("truckReadings — every dated truck reading, with its source (GL-07)", () => {
  it("collects fills, delivered loads (both ends), completed trips and tractor/both services; skips cancelled and APU rows", () => {
    expect(READINGS.map((r) => `${r.date} ${r.reading} ${r.source}`).sort()).toEqual([
      "2026-08-11 512034 the Aug 11 trip",
      "2026-08-28 595263 the Aug 28 service",
      "2026-09-11 599431 the Sep 11 fill",
      "2026-09-28 601000 load 1572011 picked up Sep 28",
      "2026-10-01 601820 load 1572011 delivered Oct 1",
      "2026-11-07 606217 the Nov 7 fill",
    ]);
  });
});

describe("truckReadingOnOrBefore — the truck's last reading up to a day", () => {
  it("the latest-dated reading on or before the day, the day itself included", () => {
    expect(truckReadingOnOrBefore("2026-09-13", READINGS)).toMatchObject({ reading: 599431, source: "the Sep 11 fill" });
    expect(truckReadingOnOrBefore("2026-09-11", READINGS)).toMatchObject({ reading: 599431 });
    expect(truckReadingOnOrBefore("2026-10-15", READINGS)).toMatchObject({ reading: 601820, source: "load 1572011 delivered Oct 1" });
  });
  it("nothing dated that early → null, never 0", () => {
    expect(truckReadingOnOrBefore("2026-08-01", READINGS)).toBeNull();
    expect(truckReadingOnOrBefore("2026-11-08", [])).toBeNull();
  });
  it("two readings on one day → the higher one", () => {
    const same = [
      { reading: 500100, date: "2026-05-01", source: "a" },
      { reading: 500400, date: "2026-05-01", source: "b" },
    ];
    expect(truckReadingOnOrBefore("2026-05-01", same)?.reading).toBe(500400);
  });
});

describe("trailerReadingToday — the truck's highest reading on record", () => {
  it("the freshest fill beats the truck record when it is higher", () => {
    const r = trailerReadingToday({ unit_number: "580991", current_odometer: "606000" }, READINGS);
    expect(r).toMatchObject({ reading: 606217, source: "the Nov 7 fill" });
    expect(meterWords(r, "580991")).toBe("606,217 · truck 580991 · the Nov 7 fill");
  });
  it("the truck record wins when it is the highest number", () => {
    const r = trailerReadingToday({ unit_number: "580991", current_odometer: 607000 }, READINGS);
    expect(r).toMatchObject({ reading: 607000, source: "truck 580991's record" });
  });
  it("no truck and no readings → null, and the words say to log one", () => {
    expect(trailerReadingToday(null, [])).toBeNull();
    expect(meterWords(null)).toMatch(/^no reading yet/);
  });
  it("shortDay never shifts a day", () => {
    expect(shortDay("2026-11-07")).toBe("Nov 7");
    expect(shortDay("2026-11-07T05:00:00.000Z")).toBe("Nov 7");
  });
});
