import { describe, it, expect } from "vitest";
import type { MaintenanceItem } from "@/types/maintenance";
import type { Load } from "@/types/load";
import {
  computeDue,
  addMonths,
  currentTractorMiles,
  recentMilesPerMonth,
  maxOdometer,
  maxTripOdometer,
  maintenanceAlerts,
  fleetHealth,
} from "./maintenance";

const item = (over: Partial<MaintenanceItem>): MaintenanceItem => ({
  item_id: "i",
  unit: "tractor",
  name: "x",
  category: "engine",
  interval_miles: null,
  interval_months: null,
  interval_hours: null,
  last_done_miles: null,
  last_done_hours: null,
  last_done_date: null,
  warn_lead_days: 30,
  truck_id: null,
  trailer_id: null,
  active: true,
  notes: null,
  ...over,
});

const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_status: "delivered",
    delivery_date: "2026-06-15",
    odometer_start: 0,
    odometer_end: 0,
    ...over,
  }) as Load;

const now = new Date("2026-07-09T00:00:00Z");

describe("addMonths", () => {
  it("adds months UTC-safe", () => {
    expect(addMonths("2026-04-17", 12)).toBe("2027-04-17");
    expect(addMonths("2025-11-08", 12)).toBe("2026-11-08");
  });
});

describe("computeDue — mileage", () => {
  it("ok when well within the interval", () => {
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      565000,
      now,
      8000,
    );
    expect(d.dueMiles).toBe(585000);
    expect(d.milesRemaining).toBe(20000);
    expect(d.level).toBe("ok");
    expect(d.progress).toBeCloseTo(0.2, 5);
  });

  it("soon at ≥85% elapsed", () => {
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      582000,
      now,
      8000,
    );
    expect(d.level).toBe("soon"); // 22000/25000 = 0.88
  });

  it("overdue past the due mileage", () => {
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      590000,
      now,
      8000,
    );
    expect(d.milesRemaining).toBe(-5000);
    expect(d.level).toBe("overdue");
  });

  it("projects a due date from miles remaining and pace", () => {
    // 20000 miles left at 10000/mo ≈ 2 months out
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      565000,
      now,
      10000,
    );
    expect(d.etaDate).not.toBeNull();
    const months =
      (new Date(d.etaDate as string).getTime() - now.getTime()) /
      (30.44 * 86_400_000);
    expect(months).toBeCloseTo(2, 0);
  });

  it("unknown without a baseline", () => {
    const d = computeDue(item({ interval_miles: 25000 }), 565000, now, 8000);
    expect(d.level).toBe("unknown");
    expect(d.progress).toBeNull();
  });
});

describe("computeDue — time", () => {
  it("uses months since last done; overdue when past", () => {
    // annual, last done 14 months ago → overdue
    const d = computeDue(
      item({ interval_months: 12, last_done_date: "2025-05-01" }),
      null,
      now,
      null,
    );
    expect(d.dueDate).toBe("2026-05-01");
    expect(d.level).toBe("overdue");
    expect(d.daysRemaining).toBeLessThan(0);
  });

  it("soon when within the last ~15% of the interval", () => {
    // 12-month interval, last done ~11 months ago
    const d = computeDue(
      item({ interval_months: 12, last_done_date: "2025-08-05" }),
      null,
      now,
      null,
    );
    expect(d.level).toBe("soon");
  });
});

describe("computeDue — 'soon' is lead-time based, not percentage", () => {
  const longItem = { interval_miles: 500000, last_done_miles: 0 };

  it("NOT soon far out even at high % elapsed (the old bug)", () => {
    // 450k of 500k = 90% elapsed, but 50k mi left ≈ 190 days at 8k/mo → ok
    const d = computeDue(item(longItem), 450000, now, 8000);
    expect(d.progress).toBeCloseTo(0.9, 5);
    expect(d.level).toBe("ok");
  });

  it("soon once the projection lands within the lead window", () => {
    // 5k mi left ≈ 19 days at 8k/mo → soon
    const d = computeDue(item(longItem), 495000, now, 8000);
    expect(d.level).toBe("soon");
  });

  it("respects each item's own warning lead", () => {
    // ~14 days out at 8k/mo (3,700 mi left of a 25k interval)
    const base = { interval_miles: 25000, last_done_miles: 560000 };
    const short = computeDue(item({ ...base, warn_lead_days: 7 }), 581300, now, 8000);
    expect(short.level).toBe("ok"); // 14 days out > 7-day lead
    const long = computeDue(item({ ...base, warn_lead_days: 30 }), 581300, now, 8000);
    expect(long.level).toBe("soon"); // 14 days out <= 30-day lead
  });

  it("falls back to % elapsed when there's no pace projection", () => {
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      582000, // 88% elapsed
      now,
      null, // no pace → no mileage ETA
    );
    expect(d.level).toBe("soon");
  });
});

describe("computeDue — hours (the APU lens)", () => {
  const apu = (over: Partial<MaintenanceItem> = {}) =>
    item({ unit: "apu", interval_hours: 1000, last_done_hours: 1000, ...over });

  it("no reading → no baseline, and never a fake 0 hrs", () => {
    const d = computeDue(apu(), null, now, null, { currentHours: null });
    expect(d.level).toBe("unknown");
    expect(d.progress).toBeNull();
    expect(d.hoursRemaining).toBeNull();
    expect(d.dueHours).toBeNull();
  });

  it("no baseline hours → unknown even with a live reading", () => {
    // The Sep 3 belt job is dated but its hours were never written down.
    const d = computeDue(
      apu({ last_done_hours: null, last_done_date: "2026-09-03" }),
      null,
      now,
      null,
      { currentHours: 1240 },
    );
    expect(d.level).toBe("unknown");
    expect(d.hoursRemaining).toBeNull();
  });

  // THE SEEDED SHAPE — "APU oil & filter" straight out of migration 078:
  // 1,000 hours or 12 months, done Apr 23, hours never written down. The months
  // lens can answer and it must NOT: an hours clock with no reading is
  // unanswered, not fine, and not overdue either.
  it("the seeded oil-and-filter shape is unknown — the months lens does not answer for it", () => {
    const seeded = apu({
      interval_hours: 1000,
      interval_months: 12,
      last_done_date: "2026-04-23",
      last_done_hours: null,
    });
    const d = computeDue(seeded, null, now, null, {
      currentHours: 1240,
      hoursPerRoadDay: 8,
      roadDayShare: 0.7,
    });
    expect(d.level).toBe("unknown");
    expect(d.decidedBy).toBeNull(); // nothing decided it → the row reads "—"
    expect(d.progress).toBeNull();
    expect(d.hoursRemaining).toBeNull();
  });

  it("the same item with a reading lets the hours lens count", () => {
    const d = computeDue(
      apu({
        interval_hours: 1000,
        interval_months: 12,
        last_done_date: "2026-04-23",
        last_done_hours: 1000,
      }),
      null,
      now,
      null,
      { currentHours: 1240, hoursPerRoadDay: 8, roadDayShare: 0.7 },
    );
    expect(d.hoursRemaining).toBe(760);
    expect(d.decidedBy).toBe("hours");
    expect(d.level).toBe("ok");
  });

  it("hours + months both present: the most-elapsed lens decides", () => {
    // 24% of the hours run, but 26 of 12 months gone — the calendar wins.
    const d = computeDue(
      apu({
        interval_hours: 1000,
        interval_months: 12,
        last_done_date: "2025-05-01",
        last_done_hours: 1000,
      }),
      null,
      now,
      null,
      { currentHours: 1240, hoursPerRoadDay: 8, roadDayShare: 0.7 },
    );
    expect(d.decidedBy).toBe("months");
    expect(d.level).toBe("overdue");
  });

  it("no rate given: the default carries it, the ETA lands, and it says so", () => {
    const d = computeDue(apu({ last_done_hours: 1000 }), null, now, null, {
      currentHours: 1920, // 80 hrs left
      // no hoursPerRoadDay, no roadDayShare — both fall back
    });
    expect(d.hoursRemaining).toBe(80);
    expect(d.etaDate).not.toBeNull(); // 80 ÷ 8 = 10 road days out
    expect(d.etaEstimated).toBe(true);
  });

  it("counts hours off the projection: due at 2,000, 760 left", () => {
    const d = computeDue(apu(), null, now, null, {
      currentHours: 1240,
      hoursPerRoadDay: 8,
      roadDayShare: 0.7,
    });
    expect(d.dueHours).toBe(2000);
    expect(d.hoursRemaining).toBe(760);
    expect(d.progress).toBeCloseTo(0.24, 5);
    expect(d.level).toBe("ok");
  });

  it("overdue once the meter runs past the interval", () => {
    const d = computeDue(apu(), null, now, null, { currentHours: 2100, hoursPerRoadDay: 8 });
    expect(d.hoursRemaining).toBe(-100);
    expect(d.level).toBe("overdue");
  });

  it("the ETA converts road days back to calendar days at the road-day share", () => {
    // 80 hrs left at 8/road-day = 10 road days. At 100% road that is 10 days
    // out; at 50% it is 20 — so a 14-day lead flags only the first.
    const tight = apu({ interval_hours: 1000, last_done_hours: 1000, warn_lead_days: 14 });
    const busy = computeDue(tight, null, now, null, {
      currentHours: 1920,
      hoursPerRoadDay: 8,
      roadDayShare: 1,
    });
    expect(busy.level).toBe("soon");
    const homebody = computeDue(tight, null, now, null, {
      currentHours: 1920,
      hoursPerRoadDay: 8,
      roadDayShare: 0.5,
    });
    expect(homebody.level).toBe("ok");
  });

  it("hours + months: the more-elapsed lens wins", () => {
    // Barely any hours run, but the annual clock is 14 months past.
    const d = computeDue(
      apu({ interval_months: 12, last_done_date: "2025-05-01" }),
      null,
      now,
      null,
      { currentHours: 1100, hoursPerRoadDay: 8 },
    );
    expect(d.hoursRemaining).toBe(900); // hours lens says plenty of room
    expect(d.level).toBe("overdue"); // the calendar does not
  });
});

describe("computeDue — a reading below the baseline is bad data", () => {
  it("hours below the last service → unknown, not a healthy negative fraction", () => {
    // Meter replaced, or a digit dropped: 1,000 at the service, 400 today.
    const d = computeDue(
      item({ unit: "apu", interval_hours: 1000, last_done_hours: 1000 }),
      null,
      now,
      null,
      { currentHours: 400, hoursPerRoadDay: 8 },
    );
    expect(d.level).toBe("unknown");
    expect(d.progress).toBeNull();
    expect(d.decidedBy).toBeNull();
    expect(d.hoursRemaining).toBeNull(); // never 1,600 "left"
  });

  it("miles below the last service → unknown, and the calendar cannot cover for it", () => {
    const d = computeDue(
      item({
        interval_miles: 25000,
        last_done_miles: 560000,
        interval_months: 6,
        last_done_date: "2026-06-01",
      }),
      540000, // 20k BELOW the baseline
      now,
      8000,
    );
    expect(d.level).toBe("unknown");
    expect(d.progress).toBeNull();
    expect(d.milesRemaining).toBeNull();
  });

  it("a reading exactly AT the baseline still counts — a fresh service is 0% elapsed", () => {
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      560000,
      now,
      8000,
    );
    expect(d.progress).toBe(0);
    expect(d.decidedBy).toBe("miles");
    expect(d.level).toBe("ok");
  });
});

describe("computeDue — decidedBy is the lens the row prints", () => {
  it("miles-only item is decided by miles", () => {
    const d = computeDue(
      item({ interval_miles: 25000, last_done_miles: 560000 }),
      565000,
      now,
      8000,
    );
    expect(d.decidedBy).toBe("miles");
  });

  it("months-only item is decided by months", () => {
    const d = computeDue(
      item({ interval_months: 12, last_done_date: "2026-01-01" }),
      null,
      now,
      null,
    );
    expect(d.decidedBy).toBe("months");
  });

  it("an item nothing can count has no deciding lens", () => {
    const d = computeDue(item({ interval_miles: 25000 }), 565000, now, 8000);
    expect(d.decidedBy).toBeNull();
    expect(d.level).toBe("unknown");
  });
});

describe("maintenanceAlerts", () => {
  it("emits overdue (critical) first, then soon (warning); skips ok/inactive", () => {
    const items = [
      item({ item_id: "ok", interval_miles: 25000, last_done_miles: 560000 }), // 20k left → ok
      item({
        item_id: "overdue",
        name: "Oil",
        interval_miles: 25000,
        last_done_miles: 540000,
      }), // 27k over → overdue
      item({
        item_id: "soon",
        name: "Lube",
        interval_miles: 25000,
        last_done_miles: 545000,
      }), // ~2k left → soon
      item({ item_id: "off", interval_miles: 25000, last_done_miles: 540000, active: false }),
    ];
    const alerts = maintenanceAlerts(items, { tractor: 567000 }, now, 8000);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].message).toContain("Oil");
    expect(alerts[1].severity).toBe("warning");
    expect(alerts[1].actionHref).toBe("/maintenance");
  });

  it("an APU item alerts off the projection, in hours", () => {
    const items = [
      item({
        item_id: "apu",
        unit: "apu",
        name: "APU oil & filter",
        interval_hours: 1000,
        last_done_hours: 1000,
      }),
    ];
    const alerts = maintenanceAlerts(
      items,
      { tractor: 567000, apu: 2100 },
      now,
      8000,
      { hoursPerRoadDay: 8, roadDayShare: 0.7 },
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].message).toBe("APU oil & filter overdue · 100 hrs over");
  });

  it("hours off a PROJECTION wear a ~; an exact meter reading does not", () => {
    const items = [
      item({
        item_id: "apu",
        unit: "apu",
        name: "APU oil & filter",
        interval_hours: 1000,
        last_done_hours: 1000,
      }),
    ];
    const projected = maintenanceAlerts(
      items,
      { tractor: 567000, apu: 2100, apuEstimated: true },
      now,
      8000,
      { hoursPerRoadDay: 8, roadDayShare: 0.7 },
    );
    expect(projected[0].message).toBe("APU oil & filter overdue · ~100 hrs over");
    const read = maintenanceAlerts(
      items,
      { tractor: 567000, apu: 2100, apuEstimated: false },
      now,
      8000,
      { hoursPerRoadDay: 8, roadDayShare: 0.7 },
    );
    expect(read[0].message).toBe("APU oil & filter overdue · 100 hrs over");
  });

  it("an APU item with no reading raises nothing — silence beats a guess", () => {
    const items = [
      item({
        item_id: "apu",
        unit: "apu",
        name: "APU air filter",
        interval_hours: 1000,
        last_done_hours: null,
      }),
    ];
    expect(maintenanceAlerts(items, { apu: null }, now, 8000)).toEqual([]);
  });
});

describe("computeDue — both lenses, worst wins", () => {
  it("time overdue outranks mileage ok", () => {
    const d = computeDue(
      item({
        interval_miles: 25000,
        last_done_miles: 560000,
        interval_months: 12,
        last_done_date: "2025-05-01",
      }),
      565000, // mileage only 20% elapsed
      now,
      8000,
    );
    expect(d.level).toBe("overdue"); // time lens dominates
  });
});

describe("currentTractorMiles / recentMilesPerMonth", () => {
  it("takes the highest odometer reading", () => {
    const loads = [
      load({ odometer_end: 560000 }),
      load({ odometer_end: 568737 }),
      load({ odometer_end: 565000 }),
    ];
    expect(currentTractorMiles(loads)).toBe(568737);
  });

  it("takes the median of recent monthly totals, ignoring a low outlier month", () => {
    // now = 2026-07-09 (see top of file). Three months: May 9000, June 8000,
    // July 1000 (a breakdown month). A mean would say 6000; the median holds at
    // the typical 8000 so the projection doesn't lurch.
    const loads = [
      load({ delivery_date: "2026-05-10", odometer_start: 0, odometer_end: 9000 }),
      load({ delivery_date: "2026-06-10", odometer_start: 0, odometer_end: 8000 }),
      load({ delivery_date: "2026-07-05", odometer_start: 0, odometer_end: 1000 }),
    ];
    expect(recentMilesPerMonth(loads, now)).toBeCloseTo(8000, 5);
  });

  it("null pace when there are no recent miles", () => {
    expect(recentMilesPerMonth([], now)).toBeNull();
  });
});

describe("maxOdometer", () => {
  it("takes the highest across sources, ignoring null/undefined", () => {
    expect(maxOdometer(314697, 568387, null)).toBe(568387); // fuel-style fresh read wins
    expect(maxOdometer(null, undefined)).toBeNull();
    expect(maxOdometer(560000)).toBe(560000);
  });
});

describe("maxTripOdometer", () => {
  const trips = [
    { truck_id: "t1", odometer_end: 570100 },
    { truck_id: "t1", odometer_end: 569000 },
    { truck_id: "t2", odometer_end: 999999 },
    { truck_id: "t1", odometer_end: null },
  ];

  it("takes the highest trip odometer, scoped to one truck when given", () => {
    expect(maxTripOdometer(trips, "t1")).toBe(570100); // ignores t2's reading
    expect(maxTripOdometer(trips)).toBe(999999); // unscoped = all trips
  });

  it("returns null when no trip carries a reading", () => {
    expect(maxTripOdometer([{ truck_id: "t1", odometer_end: null }], "t1")).toBeNull();
    expect(maxTripOdometer([])).toBeNull();
  });
});

describe("fleetHealth", () => {
  it("returns null when nothing is assessable", () => {
    expect(fleetHealth({ overdue: 0, soon: 0, ok: 0 }).score).toBeNull();
  });
  it("is Healthy when all items are ok", () => {
    const h = fleetHealth({ overdue: 0, soon: 0, ok: 10 });
    expect(h.score).toBe(100);
    expect(h.label).toBe("Healthy");
  });
  it("half-credits due-soon and zero-credits overdue", () => {
    const h = fleetHealth({ overdue: 4, soon: 2, ok: 12 }); // (12 + 1) / 18
    expect(h.score).toBe(72);
    expect(h.label).toBe("Needs attention");
  });
  it("is Rough shape when everything is overdue", () => {
    const h = fleetHealth({ overdue: 10, soon: 0, ok: 0 });
    expect(h.score).toBe(0);
    expect(h.label).toBe("Rough shape");
  });
});
