import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Trailer } from "@/types/trailer";
import type { MaintenanceService } from "@/types/maintenance";
import { computeTrailerMetrics } from "@/lib/metrics/trailerMetrics";
import {
  computeTrailerMedals,
  computeTrailerPatches,
  trailerRecords,
} from "./trailerAwards";

const L = (o: Record<string, unknown>): Load =>
  ({
    load_status: "delivered",
    payment_status: "paid",
    deadhead_miles: 0,
    loaded_miles: 0,
    trailer_net: "0",
    ...o,
  }) as unknown as Load;

const svc = (unit: string, cost: number): MaintenanceService =>
  ({ unit, cost, trailer_hub: null }) as unknown as MaintenanceService;

const TRAILER = {
  trailer_id: "t1",
  current_hub: 48_000,
  in_service_date: "2026-02-03",
} as unknown as Trailer;

describe("computeTrailerMetrics", () => {
  it("earns on its 8% share and charges maintenance only (no fuel line)", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", loaded_miles: 1000, trailer_net: "100" }),
      L({ delivery_date: "2026-05-08", loaded_miles: 1000, trailer_net: "100" }),
    ];
    // Only trailer/both maintenance counts; the tractor service is ignored.
    const services = [svc("trailer", 400), svc("tractor", 9999)];
    const m = computeTrailerMetrics(TRAILER, loads, services, new Date("2026-07-13"));
    expect(m.earnings).toBe(200);
    expect(m.totalMiles).toBe(2000);
    expect(m.earningsPerMile).toBeCloseTo(0.1, 5); // 200 / 2000
    expect(m.costToRunPerMile).toBeCloseTo(0.2, 5); // 400 / 2000, maintenance only
  });

  it("counts only delivered AND paid freight", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", loaded_miles: 500, trailer_net: "100" }),
      L({ delivery_date: "2026-05-08", loaded_miles: 500, trailer_net: "100", payment_status: "pending" }),
    ];
    const m = computeTrailerMetrics(TRAILER, loads, [], new Date("2026-07-13"));
    expect(m.earnings).toBe(100);
    expect(m.loads).toBe(1);
  });

  it("returns null per-mile metrics with no miles", () => {
    const m = computeTrailerMetrics(TRAILER, [], [], new Date("2026-07-13"));
    expect(m.earningsPerMile).toBeNull();
    expect(m.costToRunPerMile).toBeNull();
  });
});

describe("computeTrailerMedals", () => {
  it("tiers Hub Club and Trailer Earner, adds Debt Crusher when tracked", () => {
    const m = computeTrailerMedals({ hubMiles: 48_000, earnings: 11_000, deliveredCount: 44, loanPaidPct: 0.03 });
    const byKey = Object.fromEntries(m.map((x) => [x.key, x]));
    expect(byKey["hub-club"].tier).toBe(1); // ≥25k, <50k
    expect(byKey["trailer-earner"].tier).toBe(1); // ≥10k, <25k
    expect(byKey["workhorse"].tier).toBe(0); // 44 < 100
    expect(byKey["debt-crusher"].tier).toBe(0); // 3% < 25%
  });

  it("omits Debt Crusher when the loan isn't tracked", () => {
    const keys = computeTrailerMedals({ hubMiles: 0, earnings: 0, deliveredCount: 0, loanPaidPct: null }).map((m) => m.key);
    expect(keys).not.toContain("debt-crusher");
  });
});

describe("computeTrailerPatches", () => {
  it("earns Big Hauler on a heavy load against the floor", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", weight: 47_500 }),
      L({ delivery_date: "2026-05-08", weight: 30_000 }),
    ];
    const p = computeTrailerPatches(loads).find((x) => x.key === "big-hauler")!;
    expect(p.count).toBe(1); // only the 47,500-lb load clears the 46,000 floor
    expect(p.hint).toContain("lb load");
  });
});

describe("trailerRecords", () => {
  it("reports the heaviest load carried", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", weight: 44_000 }),
      L({ delivery_date: "2026-05-08", weight: 49_000 }),
    ];
    expect(trailerRecords(loads).heaviestLoad).toBe(49_000);
  });
});
