import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import { shopSpend, fleetHeatmap, lastHomeDay } from "./fleet";

const NOW = new Date("2026-08-15T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const svc = (over: Partial<MaintenanceService>): MaintenanceService => ({
  service_id: "s",
  unit: "tractor",
  service_date: "2026-08-01",
  odometer: null,
  trailer_hub: null,
  vendor: null,
  location: null,
  description: "PM",
  cost: 100,
  invoice_number: null,
  notes: null,
  item_ids: [],
  ...over,
});

describe("shopSpend", () => {
  it("buckets cost by month across the window and totals the window only", () => {
    const services = [
      svc({ service_date: "2026-08-02", cost: 1840, description: "Brake job" }),
      svc({ service_date: "2026-07-10", cost: 420, description: "PM" }),
      svc({ service_date: "2026-08-20", cost: 60, description: "Wash" }), // same month, still counts
      svc({ service_date: "2024-01-01", cost: 999, description: "Ancient" }), // before window → excluded
    ];
    const r = shopSpend(services, NOW, 12);
    expect(r.months).toHaveLength(12);
    expect(r.months.at(-1)).toMatchObject({ month: "2026-08", spend: 1900 }); // 1840 + 60
    expect(r.months.at(-2)).toMatchObject({ month: "2026-07", spend: 420 });
    expect(r.total).toBe(2320); // 1840 + 60 + 420; window excludes the 2024 service
    expect(r.serviceCount).toBe(3);
  });

  it("recent = most recent first, capped at 4", () => {
    const services = ["2026-08-10", "2026-06-01", "2026-07-15", "2026-05-01", "2026-04-01"].map(
      (d, i) => svc({ service_date: d, cost: 100 + i, description: `svc-${d}` }),
    );
    const r = shopSpend(services, NOW, 12);
    expect(r.recent.map((s) => s.date)).toEqual(["2026-08-10", "2026-07-15", "2026-06-01", "2026-05-01"]);
  });

  it("coerces numeric-string / null costs", () => {
    const r = shopSpend(
      [svc({ cost: "250.50" as unknown as number }), svc({ cost: null })],
      NOW,
      12,
    );
    expect(r.total).toBeCloseTo(250.5, 2);
  });
});

const load = (pickup: string, delivery: string): Load =>
  ({ load_status: "delivered", pickup_date: pickup, delivery_date: delivery } as Load);

describe("fleetHeatmap", () => {
  const cellFor = (h: ReturnType<typeof fleetHeatmap>, date: string) =>
    h.cells.find((c) => c.date === date);

  it("classifies days: under-load, explicit home, travel=idle, unmarked=home", () => {
    const loads = [load("2026-08-13", "2026-08-14")]; // 2-day haul
    const h = fleetHeatmap(loads, ["2026-08-10"], ["2026-08-05"], NOW, 4);
    expect(h.cells).toHaveLength(28);
    expect(h.months.length).toBeGreaterThan(0);
    expect(cellFor(h, "2026-08-14")?.status).toBe("underload");
    expect(cellFor(h, "2026-08-10")?.status).toBe("home"); // explicit mark
    expect(cellFor(h, "2026-08-05")?.status).toBe("idle"); // travel, not loaded
    expect(cellFor(h, "2026-08-12")?.status).toBe("home"); // unmarked → home
  });

  it("an explicit home mark WINS over a load span covering it", () => {
    const loads = [load("2026-08-10", "2026-08-14")]; // span covers 08-14
    const h = fleetHeatmap(loads, ["2026-08-14"], [], NOW, 4);
    expect(cellFor(h, "2026-08-14")?.status).toBe("home");
    expect(cellFor(h, "2026-08-13")?.status).toBe("underload");
  });

  it("marks days after today as future (blank)", () => {
    const h = fleetHeatmap([], [], [], NOW, 4);
    h.cells.filter((c) => c.future).forEach((c) => expect(c.date > "2026-08-15").toBe(true));
  });
});

describe("lastHomeDay", () => {
  it("most recent home day, counting unmarked as home", () => {
    const loads = [load("2026-08-13", "2026-08-15")]; // out (loaded) 13–15
    const travel = ["2026-08-11", "2026-08-12"]; // on the road 11–12
    // 08-10 and back are unmarked → home; most recent home is 08-10
    expect(lastHomeDay(loads, [], travel, NOW)).toBe("2026-08-10");
  });

  it("returns today when today is unmarked and not under load", () => {
    expect(lastHomeDay([], [], [], NOW)).toBe("2026-08-15");
  });
});

// Regression: the operator's per-diem calendar is in LOCAL days, so "today" must be
// the local day. On a US evening the UTC date is already tomorrow — an unmarked day
// that would read as home and falsely reset the counter to "home today."
describe("lastHomeDay — local-day anchor (timezone)", () => {
  const orig = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Chicago";
  });
  afterAll(() => {
    process.env.TZ = orig;
  });

  it("uses the operator's local 'today', not the UTC date", () => {
    // 2026-08-09T01:00Z = 2026-08-08 20:00 CDT — local day is the 8th, UTC day the 9th.
    const now = new Date("2026-08-09T01:00:00Z");
    expect(now.toISOString().slice(0, 10)).toBe("2026-08-09"); // sanity: UTC really is the 9th
    // nothing marked/loaded → every day is home; the most recent home is TODAY, and
    // "today" is the operator's local day (the 8th), matching the per-diem calendar.
    expect(lastHomeDay([], [], [], now)).toBe("2026-08-08");
  });
});
