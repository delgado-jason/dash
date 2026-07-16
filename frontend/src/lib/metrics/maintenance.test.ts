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
