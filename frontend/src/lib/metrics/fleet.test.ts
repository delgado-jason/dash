import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import { shopSpend, fleetHeatmap } from "./fleet";

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

  it("returns 7×weeks cells, classifies each, labels months", () => {
    const loads = [load("2026-08-13", "2026-08-14")]; // 2-day haul
    const h = fleetHeatmap(loads, ["2026-08-10"], NOW, 4);
    expect(h.cells).toHaveLength(28);
    expect(h.weeks).toBe(4);
    expect(h.months.length).toBeGreaterThan(0);
    expect(cellFor(h, "2026-08-14")?.status).toBe("underload");
    expect(cellFor(h, "2026-08-13")?.status).toBe("underload");
    expect(cellFor(h, "2026-08-10")?.status).toBe("home");
    expect(cellFor(h, "2026-08-15")?.status).toBe("idle"); // today, nothing
  });

  it("an explicit home mark WINS over a load span covering it", () => {
    const loads = [load("2026-08-10", "2026-08-14")]; // span covers 08-14
    const h = fleetHeatmap(loads, ["2026-08-14"], NOW, 4);
    expect(cellFor(h, "2026-08-14")?.status).toBe("home"); // home overrides under-load
    expect(cellFor(h, "2026-08-13")?.status).toBe("underload"); // still hauling
  });

  it("marks days after today as future (blank)", () => {
    const h = fleetHeatmap([], [], NOW, 4);
    h.cells.filter((c) => c.future).forEach((c) => expect(c.date > "2026-08-15").toBe(true));
  });
});
