import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  careerRank,
  marginGrade,
  rpmGrade,
  worseGrade,
  utilizationGrade,
  bottleneckLevers,
  allLeversOnTarget,
  getSeasonStats,
  personalBests,
  earnedTrophies,
} from "./playerCard";

const NOW = new Date("2026-07-10T12:00:00Z");

const mkLoad = (o: Partial<Load>): Load => ({
  load_id: "l",
  load_number: "L1",
  load_type: "flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "Broker",
  agent_id: "ag1",
  agent: "Redwood",
  agent_email: null,
  pickup_date: "2026-05-01",
  origin_market_id: "o",
  origin_city: "Dallas",
  origin_state: "TX",
  origin_market: "Dallas",
  destination_market_id: "d",
  destination_city: "Atlanta",
  destination_state: "GA",
  delivery_market: "Atlanta",
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "3000",
  fuel_surcharge: "0",
  total_accessorials: "0",
  commodity: null,
  payment_status: "paid",
  created_at: "2026-05-01",
  updated_at: "2026-05-01",
  ...o,
});

const mkPeriod = (
  month: string,
  income: number,
  cogs: number,
  expense: number,
): ExpensePeriod =>
  ({
    period_month: month,
    income_total: income,
    cogs_total: cogs,
    expense_total: expense,
  }) as ExpensePeriod;

describe("careerRank", () => {
  it("places 582k as Road Captain climbing to Highway Legend", () => {
    const r = careerRank(582450);
    expect(r.name).toBe("Road Captain");
    expect(r.next?.name).toBe("Highway Legend");
    expect(r.pct).toBeCloseTo(0.165, 2);
  });
  it("a newcomer is a Rookie", () => {
    expect(careerRank(40000).name).toBe("Rookie");
  });
  it("tops out at Highway Legend with no next", () => {
    const r = careerRank(1_200_000);
    expect(r.name).toBe("Highway Legend");
    expect(r.next).toBeNull();
    expect(r.pct).toBe(1);
  });
});

describe("grades", () => {
  it("marginGrade bands derive from the margin goal: goal −5 / goal / goal +5", () => {
    // Jason's researched 15% (his Settings margin_goal) ⇒ 10 / 15 / 20.
    expect(marginGrade(0.2, 0.15)).toBe("strong"); // band edges are inclusive
    expect(marginGrade(0.199, 0.15)).toBe("target");
    expect(marginGrade(0.15, 0.15)).toBe("target");
    expect(marginGrade(0.149, 0.15)).toBe("minimum");
    expect(marginGrade(0.1, 0.15)).toBe("minimum");
    expect(marginGrade(0.099, 0.15)).toBe("below");
    expect(marginGrade(null, 0.15)).toBeNull();
    // A different goal shifts every band with it — one knob, one truth.
    expect(marginGrade(0.2, 0.25)).toBe("minimum");
    // No goal passed → the MARGIN_GOAL seed constant (0.26), same fallback
    // chain as every other settings-driven number.
    expect(marginGrade(0.31)).toBe("strong");
    // A tiny goal can't push the minimum band below zero.
    expect(marginGrade(0.0, 0.02)).toBe("minimum");
  });
  it("rpmGrade rides the rate ladder", () => {
    const ladder = { walkAway: 4, minimum: 4.6, target: 5.4, strong: 6.4 };
    expect(rpmGrade(6.5, ladder)).toBe("strong");
    expect(rpmGrade(5.5, ladder)).toBe("target");
    expect(rpmGrade(4.2, ladder)).toBe("minimum");
    expect(rpmGrade(3.5, ladder)).toBe("below");
    expect(rpmGrade(null, ladder)).toBeNull();
  });
  it("worseGrade takes the lower, tolerating nulls", () => {
    expect(worseGrade("strong", "target")).toBe("target");
    expect(worseGrade("below", "strong")).toBe("below");
    expect(worseGrade(null, "target")).toBe("target");
    expect(worseGrade(null, null)).toBeNull();
  });

  it("utilizationGrade maps to the 70/80/85 benchmark", () => {
    expect(utilizationGrade(0.9)).toBe("strong");
    expect(utilizationGrade(0.82)).toBe("target");
    expect(utilizationGrade(0.73)).toBe("minimum");
    expect(utilizationGrade(0.6)).toBe("below");
    expect(utilizationGrade(null)).toBeNull();
  });

  it("bottleneckLevers names the weakest lever when it's below/minimum", () => {
    const levers = [
      { key: "rate", label: "Rate", grade: "target" as const },
      { key: "util", label: "Utilization", grade: "minimum" as const },
      { key: "margin", label: "Op margin", grade: "strong" as const },
    ];
    const bn = bottleneckLevers(levers);
    expect(bn.map((l) => l.key)).toEqual(["util"]);
    expect(allLeversOnTarget(levers)).toBe(false);
  });

  it("returns every lever tied for weakest", () => {
    const bn = bottleneckLevers([
      { key: "rate", label: "Rate", grade: "below" },
      { key: "util", label: "Utilization", grade: "below" },
      { key: "margin", label: "Op margin", grade: "target" },
    ]);
    expect(bn.map((l) => l.key).sort()).toEqual(["rate", "util"]);
  });

  it("flags no bottleneck when every lever is target or better", () => {
    const levers = [
      { key: "rate", label: "Rate", grade: "target" as const },
      { key: "util", label: "Utilization", grade: "strong" as const },
      { key: "margin", label: "Op margin", grade: "target" as const },
    ];
    expect(bottleneckLevers(levers)).toEqual([]);
    expect(allLeversOnTarget(levers)).toBe(true);
  });
});

describe("getSeasonStats", () => {
  const periods = [
    mkPeriod("2026-04-01", 22698.78, 6896.44, 12337.67),
    mkPeriod("2026-05-01", 28833.36, 5776.47, 13258.66),
    mkPeriod("2026-06-01", 27814.70, 4127.62, 18175.65),
    mkPeriod("2026-07-01", 9999, 0, 0), // in-progress month — excluded
  ];
  const loads = [
    mkLoad({ load_id: "a", delivery_date: "2026-05-12", loaded_miles: 1000, deadhead_miles: 100, linehaul: "3200", odometer_start: 570000, odometer_end: 571200, origin_market: "Dallas", delivery_market: "Atlanta" }),
    mkLoad({ load_id: "b", delivery_date: "2026-06-15", loaded_miles: 800, deadhead_miles: 200, linehaul: "2600", odometer_start: 572000, odometer_end: 573100, origin_market: "Houston", delivery_market: "Memphis" }),
    mkLoad({ load_id: "c", delivery_date: "2026-07-05", loaded_miles: 500, linehaul: "9999" }), // in-progress month — excluded
  ];

  it("is the last complete calendar quarter (Q2 = Apr–Jun), not a rolling window", () => {
    const s = getSeasonStats(periods, loads, [], NOW);
    expect(s.months).toBe(3);
    expect(s.netRevenue).toBeCloseTo(79346.84, 2);
    expect(s.netMargin).toBeCloseTo(0.2366, 3);
    expect(s.loads).toBe(2);
    expect(s.label).toBe("Apr–Jun 2026");
  });
  it("stays on the completed quarter deep into the next one (Aug → Q2, not May–Jul)", () => {
    // A rolling 3-month window would drift to May–Jul and straddle the quarter
    // line; the season must hold on Q2 (Apr–Jun) until Q3 finishes.
    const AUG = new Date("2026-08-15T00:00:00Z");
    const s = getSeasonStats(periods, loads, [], AUG);
    expect(s.label).toBe("Apr–Jun 2026");
    expect(s.loads).toBe(2); // the Jul load is excluded
    expect(s.netRevenue).toBeCloseTo(79346.84, 2);
  });
  it("subtracts only debt obligations for True Net (draws excluded upstream)", () => {
    const s = getSeasonStats(periods, loads, [], NOW, 2411); // $2,411/mo debt
    expect(s.netProfit).toBeCloseTo(18774.33, 2); // operating unchanged
    expect(s.trueNet).toBeCloseTo(18774.33 - 2411 * 3, 2); // − 3 months of debt
    expect(s.trueNetMargin).toBeCloseTo((18774.33 - 7233) / 79346.84, 4);
  });
  it("computes deadhead, avg rpm, and best lane over the window", () => {
    const s = getSeasonStats(periods, loads, [], NOW);
    expect(s.avgRpm).toBeCloseTo((3200 + 2600) / 1800, 3);
    expect(s.deadheadPct).toBeCloseTo(500 / 2300, 4); // odometer windows, not the planning field
    expect(s.bestLane?.lane).toBe("Dallas → Atlanta");
  });
});

describe("personalBests", () => {
  const fuel = [
    { odometer_reading: 570368, gallons: 131.91, price_per_gallon: 4.639, fuel_date: "2026-05-24" },
    { odometer_reading: 570967, gallons: 79.78, price_per_gallon: 4.589, fuel_date: "2026-05-26" },
    { odometer_reading: 571651, gallons: 114.425, price_per_gallon: 4.462, fuel_date: "2026-05-28" },
    { odometer_reading: 572503, gallons: 135.1, price_per_gallon: 4.322, fuel_date: "2026-05-30" },
  ] as unknown as FuelEntry[];

  it("finds best week, biggest load, most loads/week", () => {
    const loads = [
      mkLoad({ load_id: "a", delivery_date: "2026-05-12", linehaul: "3200", loaded_miles: 1000, odometer_start: 570000, odometer_end: 571200 }),
      mkLoad({ load_id: "c", delivery_date: "2026-05-13", linehaul: "1000", loaded_miles: 500, odometer_start: 571200, odometer_end: 571800 }),
      mkLoad({ load_id: "b", delivery_date: "2026-06-15", linehaul: "2600", loaded_miles: 800, odometer_start: 572000, odometer_end: 573100 }),
    ];
    const pb = personalBests(loads, fuel, NOW);
    expect(pb.bestWeekRevenue).toBeCloseTo(4200, 2);
    expect(pb.mostLoadsInWeek).toBe(2);
    expect(pb.biggestLoad).toBeCloseTo(3200, 2);
    expect(pb.bestMpg).toBeCloseTo(6.483, 2);
  });
});

describe("earnedTrophies", () => {
  it("awards mile club, relationship, century, strong season, feather foot", () => {
    const loads = Array.from({ length: 100 }, (_, i) =>
      mkLoad({ load_id: `x${i}`, agent_id: "ag1", agent: "Redwood" }),
    );
    const t = earnedTrophies({ lifetimeMiles: 582450, loads, bestMpg: 6.5, seasonMargin: "strong" });
    const keys = t.map((x) => x.key);
    expect(keys).toContain("mileclub");
    expect(keys).toContain("relationship");
    expect(keys).toContain("century");
    expect(keys).toContain("strong-season");
    expect(keys).toContain("feather-foot");
    expect(t.find((x) => x.key === "mileclub")?.name).toBe("500K Club");
  });
});
