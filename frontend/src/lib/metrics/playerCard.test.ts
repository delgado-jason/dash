import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import {
  marginGrade,
  rpmGrade,
  worseGrade,
  utilizationGrade,
  bottleneckLevers,
  allLeversOnTarget,
  getSeasonStats,
  gradedMargin,
  type SeasonStats,
} from "./playerCard";

const NOW = new Date("2026-07-10T12:00:00Z");

const mkLoad = (o: Partial<Load>): Load => ({
  load_id: "l",
  load_number: "L1",
  load_type: "flatbed",
  load_status: "delivered",
  agency_id: "b",
  agency_code: "AGY",
  posting_code: null,
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
    // A tiny goal can't push the minimum band below zero: a NEGATIVE margin
    // must still grade "below" (unclamped, minimum would be −0.03 and −0.01
    // would falsely pass as "minimum").
    expect(marginGrade(0.0, 0.02)).toBe("minimum");
    expect(marginGrade(-0.01, 0.02)).toBe("below");
    // Float-dirty goal: 0.17 − 0.05 must land exactly on 0.12, inclusive.
    expect(marginGrade(0.12, 0.17)).toBe("minimum");
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

describe("gradedMargin — one margin per page (2026-11-04, §5)", () => {
  const season = { netMargin: 0.31, label: "Apr–Jun 2026" } as unknown as SeasonStats;
  const fin = (month: string, income: number, ni: number) => ({ month, total_income: income, net_income: ni, ending_cash: 0 });

  it("reads the QBO pretax margin over the closed months when the archive has them, and names it", () => {
    const g = gradedMargin([fin("2026-04-01", 20000, 1000), fin("2026-05-01", 20000, 1000), fin("2026-06-01", 20000, 1000), fin("2026-07-01", 999999, 999999)], season, NOW, 0.26);
    expect(g.source).toBe("qbo");
    expect(g.value).toBeCloseTo(0.05, 6); // 3,000 / 60,000 — July is the running month and never counts
    expect(g.grade).toBe("below");
    expect(g.label).toBe("Pretax margin");
    expect(g.basis).toBe("QBO · Apr–Jun ’26");
  });

  it("falls back to the app's season estimate, labelled as the estimate it is", () => {
    const g = gradedMargin([], season, NOW, 0.26);
    expect(g).toMatchObject({ source: "app", value: 0.31, grade: "strong", label: "Op margin", basis: "app est. · Apr–Jun 2026" });
  });

  it("the medal and the lever cannot disagree: both read the same grade", () => {
    expect(gradedMargin([], season, NOW, 0.26).grade).toBe("strong");
    expect(gradedMargin([], { ...season, netMargin: 0.2 } as unknown as SeasonStats, NOW, 0.26).grade).toBe("below");
  });
});
