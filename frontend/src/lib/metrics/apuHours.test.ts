import { describe, it, expect, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  roadDays,
  apuReadings,
  apuRate,
  projectApuHours,
  roadDayShare,
  apuDueOptions,
  DEFAULT_APU_HOURS_PER_ROAD_DAY,
} from "./apuHours";

// The clock is injected everywhere, but roadDayShare's window walks back from
// "now", so freeze it for the tests that lean on the calendar.
afterEach(() => vi.useRealTimers());

const load = (pickup: string, delivery: string | null, over: Partial<Load> = {}): Load =>
  ({
    load_id: `${pickup}-${delivery}`,
    load_status: "delivered",
    pickup_date: pickup,
    delivery_date: delivery,
    ...over,
  }) as Load;

const svc = (over: Partial<MaintenanceService>): MaintenanceService => ({
  service_id: "s",
  unit: "apu",
  service_date: "2026-09-03",
  odometer: null,
  trailer_hub: null,
  apu_hours: null,
  vendor: "Thermo King",
  location: "Carlisle, PA",
  description: "APU work",
  cost: null,
  invoice_number: null,
  notes: null,
  item_ids: [],
  ...over,
});

const fuel = (over: Partial<FuelEntry>): FuelEntry => ({
  fuel_entry_id: "f",
  truck_id: "t",
  trip_id: null,
  fuel_date: "2026-09-10",
  gallons: 130,
  price_per_gallon: 4,
  odometer_reading: 568737,
  apu_hours: null,
  company_name: "TA",
  fuel_city: "Carlisle",
  fuel_state: "PA",
  created_at: "",
  updated_at: "",
  ...over,
});

// Sep 13, 7am Central. The zone is pinned to America/Chicago (vite.config.ts),
// and "today" for the projection is HIS day, so the fixture sits comfortably
// inside Sep 13 in both zones — the local-vs-UTC edge gets its own test below.
const now = new Date("2026-09-13T12:00:00Z");

describe("roadDays — which days the truck was working", () => {
  it("counts a load's days inclusive of pickup and delivery", () => {
    // Sep 1 → Sep 3 is three days, not two.
    expect(roadDays([load("2026-09-01", "2026-09-03")], "2026-09-01", "2026-09-13")).toBe(3);
  });

  it("is zero with no loads at all, and zero on an inverted window", () => {
    expect(roadDays([], "2026-09-01", "2026-09-13")).toBe(0);
    expect(
      roadDays([load("2026-09-01", "2026-09-03")], "2026-09-13", "2026-09-01"),
    ).toBe(0);
  });

  it("bridges a one-day gap between loads, but not a two-day one", () => {
    // Sep 1–3, then Sep 5–6: Sep 4 is the single empty day → still the road.
    expect(
      roadDays(
        [load("2026-09-01", "2026-09-03"), load("2026-09-05", "2026-09-06")],
        "2026-09-01",
        "2026-09-13",
      ),
    ).toBe(6);
    // Sep 1–3, then Sep 6–7: Sep 4 and 5 are home → the gap is not bridged.
    expect(
      roadDays(
        [load("2026-09-01", "2026-09-03"), load("2026-09-06", "2026-09-07")],
        "2026-09-01",
        "2026-09-13",
      ),
    ).toBe(5);
  });

  it("a home stretch adds nothing", () => {
    // The truck ran Sep 1–3 and then sat. Sep 4 onward is home.
    expect(roadDays([load("2026-09-01", "2026-09-03")], "2026-09-05", "2026-09-13")).toBe(0);
  });

  it("a cancelled load is not a road day", () => {
    expect(
      roadDays(
        [load("2026-09-01", "2026-09-03", { load_status: "cancelled" })],
        "2026-09-01",
        "2026-09-13",
      ),
    ).toBe(0);
  });

  it("counts straight across a month boundary", () => {
    // Aug 28 → Sep 3 is 7 days, and the window runs Aug 1 → Sep 30. Day keys
    // are compared as strings, so "2026-08-28" < "2026-09-03" has to hold.
    expect(
      roadDays([load("2026-08-28", "2026-09-03")], "2026-08-01", "2026-09-30"),
    ).toBe(7);
    // Clipped to a window that starts mid-load: Sep 1, 2, 3 only.
    expect(
      roadDays([load("2026-08-28", "2026-09-03")], "2026-09-01", "2026-09-30"),
    ).toBe(3);
    // And across a year boundary, where the string compare is the whole trick.
    expect(
      roadDays([load("2026-12-30", "2027-01-02")], "2026-12-01", "2027-01-31"),
    ).toBe(4);
  });

  it("an undelivered load is one day at its pickup, and overlaps merge", () => {
    expect(roadDays([load("2026-09-08", null)], "2026-09-01", "2026-09-13")).toBe(1);
    expect(
      roadDays(
        [load("2026-09-01", "2026-09-05"), load("2026-09-03", "2026-09-04")],
        "2026-09-01",
        "2026-09-13",
      ),
    ).toBe(5); // the inner load is already inside the outer one
  });
});

describe("apuReadings — a reading is a service row or a fuel row", () => {
  it("is empty when nothing carries a reading", () => {
    expect(apuReadings([], [])).toEqual([]);
    expect(apuReadings([svc({})], [fuel({})])).toEqual([]);
  });

  it("takes APU services and fuel entries, oldest first", () => {
    const readings = apuReadings(
      [svc({ service_date: "2026-09-03", apu_hours: 1200 })],
      [fuel({ fuel_date: "2026-08-20", apu_hours: 1100 })],
    );
    expect(readings).toEqual([
      { day: "2026-08-20", hours: 1100 },
      { day: "2026-09-03", hours: 1200 },
    ]);
  });

  it("ignores a service on another unit — a truck PM reads no APU meter", () => {
    expect(
      apuReadings([svc({ unit: "tractor", apu_hours: 900 })], []),
    ).toEqual([]);
  });

  it("a fuel reading newer than a service reading wins", () => {
    const readings = apuReadings(
      [svc({ service_date: "2026-09-03", apu_hours: 1200 })],
      [fuel({ fuel_date: "2026-09-10", apu_hours: 1264 })],
    );
    expect(readings[readings.length - 1]).toEqual({ day: "2026-09-10", hours: 1264 });
  });

  it("on the SAME day the fuel reading sorts last, whatever order they arrive", () => {
    // The tie is decided by source, not by which loop happened to push first:
    // the invoice is filed from paperwork, the pump number is read at the truck.
    const readings = apuReadings(
      [svc({ service_date: "2026-09-03", apu_hours: 1200 })],
      [fuel({ fuel_date: "2026-09-03", apu_hours: 1201 })],
    );
    expect(readings).toEqual([
      { day: "2026-09-03", hours: 1200 },
      { day: "2026-09-03", hours: 1201 },
    ]);
  });
});

describe("apuRate — the APU's own hours per road day", () => {
  it("is null with fewer than two readings", () => {
    expect(apuRate([], [])).toBeNull();
    expect(apuRate([{ day: "2026-09-03", hours: 1200 }], [])).toBeNull();
  });

  it("learns 10 hrs/day from 300 hours over 30 road days", () => {
    // Aug 5 → Sep 4 is 30 days after the first reading, all of them on the road.
    const loads = [load("2026-08-05", "2026-09-04")];
    const readings = [
      { day: "2026-08-05", hours: 1000 },
      { day: "2026-09-04", hours: 1300 },
    ];
    expect(apuRate(readings, loads)).toBeCloseTo(10, 6);
  });

  it("is null when no road day sits between the two readings", () => {
    expect(
      apuRate(
        [
          { day: "2026-09-01", hours: 1000 },
          { day: "2026-09-05", hours: 1040 },
        ],
        [], // he was home the whole stretch
      ),
    ).toBeNull();
  });

  it("a same-day service + fuel-up does not throw the learned rate away", () => {
    // He gets the APU serviced Sep 3 (1,200) and fuels up the same afternoon
    // (1,201). Pairing those two would be zero road days and no rate at all —
    // so the pair that teaches is Apr 23 → Sep 3, which he actually drove:
    // 1,065 hours over the 133 road days that follow the April reading.
    const loads = [load("2026-04-24", "2026-09-03")];
    const readings = [
      { day: "2026-04-23", hours: 136 },
      { day: "2026-09-03", hours: 1200 },
      { day: "2026-09-03", hours: 1201 },
    ];
    expect(apuRate(readings, loads)).toBeCloseTo(1065 / 133, 6);
  });

  it("is null when every reading it holds is from the same day", () => {
    expect(
      apuRate(
        [
          { day: "2026-09-03", hours: 1200 },
          { day: "2026-09-03", hours: 1201 },
        ],
        [load("2026-08-01", "2026-09-03")],
      ),
    ).toBeNull(); // → projectApuHours falls back to the default
  });

  it("is null when the meter went backwards — a replacement, not a rate", () => {
    expect(
      apuRate(
        [
          { day: "2026-08-05", hours: 9000 },
          { day: "2026-09-04", hours: 12 },
        ],
        [load("2026-08-05", "2026-09-04")],
      ),
    ).toBeNull();
  });
});

describe("projectApuHours — last reading + road days × rate", () => {
  it("is null with no reading at all — never a fake 0 hrs", () => {
    const p = projectApuHours([], [load("2026-09-01", "2026-09-12")], now);
    expect(p.hours).toBeNull();
    expect(p.source).toBeNull();
    expect(p.readOn).toBeNull();
    expect(p.estimated).toBe(false);
    expect(p.rate).toBe(DEFAULT_APU_HOURS_PER_ROAD_DAY);
  });

  it("one reading today is exact — not an estimate", () => {
    const p = projectApuHours(
      [{ day: "2026-09-13", hours: 1240 }],
      [load("2026-09-01", "2026-09-13")],
      now,
    );
    expect(p.hours).toBe(1240);
    expect(p.estimated).toBe(false);
    expect(p.source).toBe("reading");
    expect(p.readOn).toBe("2026-09-13");
  });

  it("one reading 10 days ago with 6 road days adds 48 at the default rate", () => {
    // Read Sep 3. Sep 4–9 on the road (6 days), Sep 10–13 at the house.
    const p = projectApuHours(
      [{ day: "2026-09-03", hours: 1240 }],
      [load("2026-09-04", "2026-09-09")],
      now,
    );
    expect(p.rate).toBe(8);
    expect(p.hours).toBe(1240 + 48);
    expect(p.estimated).toBe(true);
    expect(p.source).toBe("projection");
    expect(p.readOn).toBe("2026-09-03");
  });

  it("uses the learned rate once two readings exist", () => {
    // 300 hrs over 30 road days = 10/day, then 3 more road days (Sep 5–7).
    const loads = [load("2026-08-05", "2026-09-04"), load("2026-09-05", "2026-09-07")];
    const readings = [
      { day: "2026-08-05", hours: 1000 },
      { day: "2026-09-04", hours: 1300 },
    ];
    const p = projectApuHours(readings, loads, now);
    expect(p.rate).toBeCloseTo(10, 6);
    expect(p.hours).toBe(1300 + 30); // Sep 5, 6, 7 — the rest is home
    expect(p.estimated).toBe(true);
  });

  it("a home stretch adds nothing — the reading still stands", () => {
    const p = projectApuHours(
      [{ day: "2026-09-03", hours: 1240 }],
      [], // he has been in the driveway since
      now,
    );
    expect(p.hours).toBe(1240);
    expect(p.estimated).toBe(false);
    expect(p.source).toBe("reading");
  });

  it("cancelled loads are not road days", () => {
    const p = projectApuHours(
      [{ day: "2026-09-03", hours: 1240 }],
      [load("2026-09-04", "2026-09-09", { load_status: "cancelled" })],
      now,
    );
    expect(p.hours).toBe(1240);
    expect(p.estimated).toBe(false);
  });

  it("a fuel reading re-anchors the projection over an older service reading", () => {
    const loads = [load("2026-09-01", "2026-09-13")];
    const readings = apuReadings(
      [svc({ service_date: "2026-09-03", apu_hours: 1200 })],
      [fuel({ fuel_date: "2026-09-12", apu_hours: 1264 })],
    );
    const p = projectApuHours(readings, loads, now);
    // Anchored on the pump reading, not the older invoice: 64 hrs over the 9
    // road days Sep 4–12 teaches ~7.1/day, and only Sep 13 is left to project.
    expect(p.readOn).toBe("2026-09-12");
    expect(p.rate).toBeCloseTo(64 / 9, 6);
    expect(p.hours).toBe(1271);
    expect(p.estimated).toBe(true);
  });

  it("a reading with nothing after it is exact even on a road day", () => {
    // The load ends the day before today, so no road day has passed since the
    // reading — the number is the meter's, not the projection's.
    const p = projectApuHours(
      [{ day: "2026-09-12", hours: 1264 }],
      [load("2026-09-01", "2026-09-12")],
      now,
    );
    expect(p.hours).toBe(1264);
    expect(p.source).toBe("reading");
  });
});

describe("roadDayShare — road days as a slice of the calendar", () => {
  it("is null when nothing ran in the window", () => {
    expect(roadDayShare([], now, 90)).toBeNull();
    expect(roadDayShare([load("2026-09-01", "2026-09-12")], now, 0)).toBeNull();
  });

  it("is the share of the window spent on the road", () => {
    // Sep 4–13 inclusive = 10 road days of a 10-day window.
    expect(roadDayShare([load("2026-09-04", "2026-09-13")], now, 10)).toBeCloseTo(1, 6);
    // Sep 9–13 = 5 of 10.
    expect(roadDayShare([load("2026-09-09", "2026-09-13")], now, 10)).toBeCloseTo(0.5, 6);
  });

  it("reads the injected clock, not the wall clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(roadDayShare([load("2026-09-09", "2026-09-13")], now, 10)).toBeCloseTo(0.5, 6);
  });
});

// Today is the day HE is standing in. After ~7pm Central, toISOString has
// already rolled over to tomorrow — and tomorrow is a road day he has not
// driven yet, so a UTC "today" would hand the projection free hours every
// evening and take them back every morning.
describe("today is the LOCAL day, not UTC's", () => {
  // 7:30pm CDT on Sep 13 = 00:30Z on Sep 14.
  const evening = new Date("2026-09-14T00:30:00Z");

  it("the projection does not gain a road day at 7:30pm", () => {
    const loads = [load("2026-09-04", "2026-09-30")]; // still rolling
    const readings = [{ day: "2026-09-12", hours: 1264 }];
    // Sep 13 is the only road day since the reading — not Sep 13 AND Sep 14.
    expect(projectApuHours(readings, loads, evening).hours).toBe(
      1264 + DEFAULT_APU_HOURS_PER_ROAD_DAY,
    );
  });

  it("the road-day share window still closes on today", () => {
    // Sep 4–13 inclusive is 10 of a 10-day window ending Sep 13.
    expect(roadDayShare([load("2026-09-04", "2026-09-13")], evening, 10)).toBeCloseTo(
      1,
      6,
    );
  });
});

describe("apuDueOptions — one projection, every surface", () => {
  it("bundles the projection, the rate and the share from the raw rows", () => {
    const loads = [load("2026-09-04", "2026-09-13")];
    const o = apuDueOptions(
      [svc({ service_date: "2026-09-03", apu_hours: 1200 })],
      [fuel({ fuel_date: "2026-09-12", apu_hours: 1264 })],
      loads,
      now,
    );
    expect(o.apu.readOn).toBe("2026-09-12");
    expect(o.hoursPerRoadDay).toBe(o.apu.rate);
    expect(o.roadDayShare).toBe(roadDayShare(loads, now));
  });

  it("with nothing logged it still answers — null hours, the default rate", () => {
    const o = apuDueOptions([], [], [], now);
    expect(o.apu.hours).toBeNull();
    expect(o.hoursPerRoadDay).toBe(DEFAULT_APU_HOURS_PER_ROAD_DAY);
    expect(o.roadDayShare).toBeNull();
  });
});
