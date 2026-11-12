import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import {
  ratePoints,
  median,
  monthlyMedianRate,
  percentileOf,
  windowRates,
  tierGauge,
} from "./marketAnalytics";

// Minimal delivered-load fixture: gross_revenue over an odometer window gives a
// clean gross-$/driven-mile.
const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_number: "n",
    load_status: "delivered",
    delivery_date: "2026-05-10",
    gross_revenue: "2000",
    odometer_start: 0,
    odometer_end: 500,
    loaded_miles: 500,
    deadhead_miles: 0,
    load_type: "standard flatbed",
    ...over,
  }) as Load;

describe("ratePoints", () => {
  it("computes gross/driven-mile, buckets by type, sorts oldest→newest", () => {
    const pts = ratePoints([
      load({ delivery_date: "2026-05-10", gross_revenue: "2500", odometer_start: 0, odometer_end: 500, load_type: "oversize" }),
      load({ delivery_date: "2026-02-01", gross_revenue: "2000", odometer_start: 0, odometer_end: 500, load_type: "standard flatbed" }),
      load({ delivery_date: "2026-03-01", gross_revenue: "3000", odometer_start: 0, odometer_end: 500, load_type: "hazmat" }),
    ]);
    expect(pts.map((p) => p.date)).toEqual(["2026-02-01", "2026-03-01", "2026-05-10"]);
    expect(pts[0]).toMatchObject({ rate: 4, bucket: "standard" });
    expect(pts[1]).toMatchObject({ rate: 6, bucket: "hazmat" });
    expect(pts[2]).toMatchObject({ rate: 5, bucket: "specialized" });
  });

  it("falls back to loaded+deadhead when there's no odometer window", () => {
    const [p] = ratePoints([
      load({ odometer_start: null, odometer_end: null, loaded_miles: 400, deadhead_miles: 100, gross_revenue: "2500" }),
    ]);
    expect(p.rate).toBe(5); // 2500 / (400+100)
  });

  it("drops non-delivered loads and zero-mile loads", () => {
    expect(
      ratePoints([
        load({ load_status: "booked" }),
        load({ odometer_start: null, odometer_end: null, loaded_miles: 0, deadhead_miles: 0 }),
      ]),
    ).toHaveLength(0);
  });
});

describe("median", () => {
  it("odd, even, and empty", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("monthlyMedianRate", () => {
  it("groups rates by calendar month, oldest→newest", () => {
    const pts = ratePoints([
      load({ delivery_date: "2026-02-05", gross_revenue: "1500", odometer_end: 500 }), // 3.0
      load({ delivery_date: "2026-02-20", gross_revenue: "2500", odometer_end: 500 }), // 5.0
      load({ delivery_date: "2026-03-03", gross_revenue: "2000", odometer_end: 500 }), // 4.0
    ]);
    const m = monthlyMedianRate(pts);
    expect(m).toEqual([
      { month: "2026-02", median: 4, n: 2 },
      { month: "2026-03", median: 4, n: 1 },
    ]);
  });
});

describe("percentileOf", () => {
  it("fraction at or below the value", () => {
    expect(percentileOf([1, 2, 3, 4, 5], 3)).toBeCloseTo(0.6); // 1,2,3
    expect(percentileOf([1, 2, 3, 4, 5], 5)).toBe(1);
    expect(percentileOf([], 3)).toBeNull();
  });
});

describe("windowRates", () => {
  it("keeps only the trailing window, clock injected", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const pts = ratePoints([
      load({ delivery_date: "2026-02-01", gross_revenue: "1000", odometer_end: 500 }), // old, out
      load({ delivery_date: "2026-06-01", gross_revenue: "2500", odometer_end: 500 }), // in
      load({ delivery_date: "2026-07-10", gross_revenue: "3000", odometer_end: 500 }), // in
    ]);
    expect(windowRates(pts, now, 90).sort()).toEqual([5, 6]);
  });
});

describe("tierGauge — your rungs among your own accepted loads, per type", () => {
  const ladder = (target: number, prime: number): RateLadder => ({ breakEven: 3, minimum: target - 0.5, target, prime });
  const now = new Date("2026-06-15T12:00:00Z");
  // ten standard loads $3–7.5 and two oversize at $9 and $10
  const recent = ratePoints([
    ...[3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5].map((r, i) =>
      load({ delivery_date: `2026-06-${String(i + 1).padStart(2, "0")}`, gross_revenue: String(r * 500), odometer_end: 500 }),
    ),
    load({ delivery_date: "2026-06-11", gross_revenue: "4500", odometer_end: 500, load_type: "oversize" }),
    load({ delivery_date: "2026-06-12", gross_revenue: "5000", odometer_end: 500, load_type: "oversize" }),
  ]);

  it("ranks a Standard rung among standard loads only, and prints the count", () => {
    const g = tierGauge(recent, ladder(4.5, 6), ladder(9, 10), now);
    const std = g.rows.find((r) => r.label === "Standard target")!;
    expect(std.n).toBe(10);
    expect(std.pctile).toBeCloseTo(0.4); // 3, 3.5, 4, 4.5 ≤ 4.5 → 4/10 — the two $9–10 oversize loads don't lift it
    expect(g.windowN).toBe(12);
  });

  it("leaves a rung unranked under eight loads of its type — the number would say nothing", () => {
    const g = tierGauge(recent, ladder(4.5, 6), ladder(9, 10), now);
    const spec = g.rows.find((r) => r.label === "Specialized target")!;
    expect(spec).toMatchObject({ n: 2, pctile: null });
  });

  it("no rows without a ladder", () => {
    const empty: RateLadder = { breakEven: null, minimum: null, target: null, prime: null };
    expect(tierGauge(recent, empty, empty, now).rows).toHaveLength(0);
  });
});
