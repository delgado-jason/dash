import { describe, it, expect } from "vitest";
import {
  isFirstOfMonth,
  deductionBuckets,
  weeklyFuelCost30,
  settlementDateInWeek,
  depositToPeriodEnding,
  loadSettlementRollup,
} from "./settlements";

const s = (period_ending: string, deductions: number, advances: number) =>
  ({ period_ending, deductions, advances }) as never;

describe("isFirstOfMonth", () => {
  it("day <= 7 is the insurance-heavy first settlement", () => {
    expect(isFirstOfMonth("2026-09-03")).toBe(true);
    expect(isFirstOfMonth("2026-09-07")).toBe(true);
    expect(isFirstOfMonth("2026-09-08")).toBe(false);
    expect(isFirstOfMonth("2026-09-25")).toBe(false);
  });
});

describe("deductionBuckets", () => {
  it("splits buckets and excludes advances", () => {
    const b = deductionBuckets([
      s("2026-09-03", 3689, 2000), // first bucket: 1689
      s("2026-08-27", 2811, 2000), // standard: 811
      s("2026-08-20", 2400, 1900), // standard: 500
      s("2026-08-06", 3100, 2000), // first bucket: 1100
    ]);
    expect(b.firstOfMonth).toBeCloseTo((1689 + 1100) / 2, 2);
    expect(b.standard).toBeCloseTo((811 + 500) / 2, 2);
    expect(b.samples).toBe(4);
  });

  it("takes only the last n settlements, newest first", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      s(`2026-0${(i % 8) + 1}-1${i % 9}`, 1000 + i, 500),
    );
    expect(deductionBuckets(many, 12).samples).toBe(12);
  });

  it("clamps a negative ex-advance week to 0 and nulls empty buckets", () => {
    const b = deductionBuckets([s("2026-09-20", 1500, 2000)]);
    expect(b.standard).toBe(0);
    expect(b.firstOfMonth).toBeNull(); // no first-of-month samples -> null, not 0
  });

  it("returns nulls with no data", () => {
    const b = deductionBuckets([]);
    expect(b.firstOfMonth).toBeNull();
    expect(b.standard).toBeNull();
  });
});

describe("weeklyFuelCost30", () => {
  const endKey = "2026-09-06"; // the operator's local day key, as the page passes it
  const entry = (fuel_date: string, gallons: number, price_per_gallon: number) =>
    ({ fuel_date, gallons, price_per_gallon }) as never;

  it("averages the trailing 30 days to a weekly figure", () => {
    const entries = [
      entry("2026-09-01", 100, 3.5), // 350
      entry("2026-08-20", 120, 3.0), // 360
      entry("2026-08-08", 90, 4.0), // 360  (30-day window starts 08-08)
      entry("2026-08-07", 500, 4.0), // outside — excluded
    ];
    expect(weeklyFuelCost30(entries, endKey)).toBeCloseTo(((350 + 360 + 360) / 30) * 7, 2);
  });

  it("null with no entries in the window — caller falls back to assumption", () => {
    expect(weeklyFuelCost30([entry("2026-07-01", 100, 3.5)], endKey)).toBeNull();
    expect(weeklyFuelCost30([], endKey)).toBeNull();
  });
});

describe("depositToPeriodEnding", () => {
  // real shape: Thursday period-endings, Wednesday deposits (6-day lag)
  it("shifts a deposit back to its statement week across a month boundary", () => {
    expect(depositToPeriodEnding("2026-09-09", "2026-09-03")).toBe("2026-09-03");
    expect(depositToPeriodEnding("2026-09-02", "2026-09-03")).toBe("2026-08-27");
  });

  it("same-weekday deposit maps a full week back, never zero", () => {
    expect(depositToPeriodEnding("2026-09-10", "2026-09-03")).toBe("2026-09-03");
  });
});

describe("settlementDateInWeek", () => {
  it("finds the settlement weekday inside the week", () => {
    // 2026-09-06 is a Sunday; Wednesday (3) lands on 09-09
    expect(settlementDateInWeek("2026-09-06", 3)).toBe("2026-09-09");
    // week starting on the settlement day itself is day 0
    expect(settlementDateInWeek("2026-09-09", 3)).toBe("2026-09-09");
  });
});

describe("loadSettlementRollup", () => {
  const line = (over: Record<string, unknown>) =>
    ({
      line_id: "x",
      kind: "trip",
      line_class: "linehaul",
      is_adjustment: false,
      description: "TRACTOR L/H",
      revenue: null,
      refunds: null,
      deductions: null,
      net: null,
      unit: "T1",
      period_ending: "2026-03-25",
      server_url: "https://files.dts-ops.co/x.pdf",
      ...over,
    }) as never;

  it("verifies when settled revenue matches expected net (the 8017702 case)", () => {
    const r = loadSettlementRollup(
      [
        line({ revenue: 2092.96, net: 1403.27, deductions: null }),
        line({ line_class: "fsc", revenue: 380.06 }),
        line({ line_class: "accessorial", revenue: 400.0 }),
        line({ line_class: "advance", deductions: 1466.0 }),
        line({ line_class: "fee", deductions: 3.75 }),
      ],
      2873.02,
    )!;
    expect(r.status).toBe("verified");
    expect(r.grossSettled).toBeCloseTo(2873.02, 2);
    expect(r.advancesAndFees).toBeCloseTo(1469.75, 2);
    // the printed per-line Net is the whole load's aggregate — netToDate must
    // come from the columns, or multi-line loads double-count ($713.58 bug)
    expect(r.netToDate).toBeCloseTo(1403.27, 2);
  });

  it("a named late fee reads adjusted, not unexplained, and hits net-to-date", () => {
    // real line shape: components + advances, then the late fee weeks later
    const r = loadSettlementRollup(
      [
        line({ revenue: 2092.96, net: 1403.27 }),
        line({ line_class: "fsc", revenue: 380.06 }),
        line({ line_class: "accessorial", revenue: 400.0 }),
        line({ line_class: "advance", deductions: 1466.0 }),
        line({ line_class: "fee", deductions: 3.75 }),
        line({
          is_adjustment: true,
          line_class: "permit-fee",
          description: "PERMIT FEE",
          deductions: 85.0,
          period_ending: "2026-04-15",
        }),
      ],
      2873.02,
    )!;
    expect(r.status).toBe("adjusted");
    expect(r.adjustments).toHaveLength(1);
    expect(r.adjustments[0].amount).toBeCloseTo(-85.0, 2);
    expect(r.netToDate).toBeCloseTo(1403.27 - 85.0, 2);
  });

  it("an unexplained revenue shortfall reads unexplained with the delta", () => {
    const r = loadSettlementRollup([line({ revenue: 479.74, net: 479.74 })], 564.74)!;
    expect(r.status).toBe("unexplained");
    expect(r.delta).toBeCloseTo(-85.0, 2);
  });

  it("reversal + rebill pairs stay verified when they net to the promise", () => {
    const r = loadSettlementRollup(
      [
        line({ revenue: 477.52, net: 477.52, period_ending: "2026-03-04" }),
        line({
          is_adjustment: true,
          line_class: "reversal",
          revenue: -477.52,
          period_ending: "2026-03-25",
        }),
        line({ revenue: 479.74, period_ending: "2026-03-25" }),
      ],
      479.74,
    )!;
    expect(r.status).toBe("adjusted");
    expect(r.grossSettled).toBeCloseTo(479.74, 2);
    expect(r.settledPeriods).toEqual(["2026-03-04", "2026-03-25"]);
  });

  it("null with no lines; expected-null loads read none — never a false ✓", () => {
    expect(loadSettlementRollup([], 100)).toBeNull();
    const r = loadSettlementRollup([line({ revenue: 100 })], null)!;
    expect(r.status).toBe("none");
  });
});
