import { describe, it, expect } from "vitest";
import { depositForWeek, fuelForWeek, type CashBoardInput, type CashCheck } from "./cashBoard";
import type { Load } from "@/types/load";

// A week Jason has PLANNED to be home must not be forecast as a working week
// (migration 107, Nod Sheet "Home Time And The Forecast"). Three projections
// change and nothing else does: the revenue fallback, the fuel pace, and the
// advance he draws against loads. Payroll and the bills never cared where the
// truck was, and they are not touched here.
//
// Today is Wed Dec 2 2026, so every week below is OPEN or future — which is
// the only case where the board projects at all.
const NOV30: CashCheck = { date: "2026-11-30", balance: 12000, kind: "snapshot", note: null };

const input = (over: Partial<CashBoardInput> = {}): CashBoardInput => ({
  today: "2026-12-02",
  settlementDay: 3, // Wednesday
  depositLagDays: 1,
  floatLine: 10000,
  checks: [NOV30],
  loads: [] as Load[],
  settlements: [],
  fuelEntries: [],
  obligations: [],
  readings: [],
  weeklyPayroll: 1908,
  perMile: 0.32,
  fuelPaceWeekly: 1400,
  fuelFallback: 1400,
  advanceDefault: 2000,
  advancePaceWeekly: 2100,
  buckets: { firstOfMonth: 0, standard: 362, samples: 4 },
  deductionsFallback: 362,
  weeklyRevenueFallback: 4647,
  moneyDays: [],
  overrides: {},
  accruals: [],
  ...over,
});

const DEC23 = { start: "2026-12-23", end: "2026-12-29" };
const ALL_WEEK = [
  "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26",
  "2026-12-27", "2026-12-28", "2026-12-29",
];

describe("the deposit — the bigger of the two home-time errors", () => {
  it("projects a FULL planning week when nothing is planned", () => {
    const d = depositForWeek(input(), DEC23, NOV30);
    expect(d.revenue).toBeCloseTo(4647, 2);
    expect(d.revenueSource).toBe("fallback");
  });

  it("projects NOTHING for a week planned fully home, and says why", () => {
    const d = depositForWeek(input({ plannedHomeDays: ALL_WEEK }), DEC23, NOV30);
    expect(d.revenue).toBe(0);
    expect(d.revenueSource).toBe("home");
    // The advance and the bucket still come off, so the deposit itself is
    // floored at zero rather than going negative — Landstar carries a deficit.
    expect(d.amount).toBe(0);
  });

  it("scales a part-week instead of ruling it one way or the other", () => {
    // Home Wed–Fri, back on the road Sat: four sevenths of a working week.
    const d = depositForWeek(
      input({ plannedHomeDays: ["2026-12-23", "2026-12-24", "2026-12-25"] }),
      DEC23,
      NOV30,
    );
    expect(d.revenue).toBeCloseTo(round2(4647 * (4 / 7)), 2);
    expect(d.revenueSource).toBe("fallback");
  });

  it("still credits a load delivered in a week planned home", () => {
    // He goes home, but a load he booked earlier delivers on the Monday. The
    // loads win over a zeroed fallback, because they are facts.
    const load = {
      load_id: "L1", load_number: "1", load_status: "delivered",
      delivery_date: "2026-12-28", pickup_date: "2026-12-21",
      net_revenue: "3000", gross_revenue: "4000",
    } as unknown as Load;
    const d = depositForWeek(input({ plannedHomeDays: ALL_WEEK, loads: [load] }), DEC23, NOV30);
    expect(d.revenueSource).toBe("loads");
    expect(d.revenue).toBeGreaterThan(0);
  });

  it("does not refuse for a missing planning week it no longer needs", () => {
    // With no weeklyRevenueFallback typed, an ordinary open week refuses.
    const bare = depositForWeek(input({ weeklyRevenueFallback: null }), DEC23, NOV30);
    expect(bare.amount).toBeNull();
    expect((bare.missing ?? []).length).toBeGreaterThan(0);
    // A week planned fully home is not measured against a working week at all,
    // so it has nothing to refuse about.
    const home = depositForWeek(
      input({ weeklyRevenueFallback: null, plannedHomeDays: ALL_WEEK }),
      DEC23,
      NOV30,
    );
    expect(home.revenue).toBe(0);
    // A line only carries `missing` when it refuses, so its absence IS the
    // assertion: the week projected a figure instead of giving up.
    expect(home.amount).not.toBeNull();
    expect(home.missing ?? []).toEqual([]);
  });
});

describe("the fuel and the advance — no miles, no fills, nothing to borrow against", () => {
  it("projects a full week's fuel and advance when nothing is planned", () => {
    const f = fuelForWeek(input(), DEC23, NOV30);
    expect(f.spent).toBeCloseTo(1400, 2);
    expect(f.advances).toBeCloseTo(2100, 2);
    expect(f.advancesSource).toBe("pace");
  });

  it("zeroes both for a week planned fully home, and says it was a choice", () => {
    const f = fuelForWeek(input({ plannedHomeDays: ALL_WEEK }), DEC23, NOV30);
    expect(f.spent).toBe(0);
    expect(f.advances).toBe(0);
    // "home" and not "none": a closed empty week also draws nothing, but only
    // one of the two is a decision he made.
    expect(f.advancesSource).toBe("home");
  });

  it("scales a part-week", () => {
    const f = fuelForWeek(
      input({ plannedHomeDays: ["2026-12-23", "2026-12-24", "2026-12-25"] }),
      DEC23,
      NOV30,
    );
    expect(f.spent).toBeCloseTo(round2(1400 * (4 / 7)), 2);
    expect(f.advances).toBeCloseTo(round2(2100 * (4 / 7)), 2);
  });

  it("an ACTUAL fill still counts in a week planned home", () => {
    // He went home and filled up anyway. A receipt beats a plan.
    //
    // This has to be the CURRENT week, not a future one: fills are counted up
    // to today, so a future week cannot have any — which is correct, and is
    // why the first draft of this test read 0.
    const THIS_WEEK = { start: "2026-12-02", end: "2026-12-08" };
    const f = fuelForWeek(
      input({
        plannedHomeDays: ["2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05",
                          "2026-12-06", "2026-12-07", "2026-12-08"],
        // A fill is gallons × price here, not a total — `FuelLike` has no
        // total_cost field, and inventing one is how the first draft read 0.
        fuelEntries: [{ fuel_date: "2026-12-02", gallons: 110, price_per_gallon: "3.75" }],
      }),
      THIS_WEEK,
      NOV30,
    );
    expect(f.spent).toBeCloseTo(412.5, 2);
  });

  it("does not refuse for an advance it no longer needs", () => {
    const home = fuelForWeek(
      input({ advanceDefault: null, advancePaceWeekly: null, plannedHomeDays: ALL_WEEK }),
      DEC23,
      NOV30,
    );
    expect(home.advances).toBe(0);
    expect(home.missing.some((m) => m.key === "advanceDefault")).toBe(false);
  });
});

const round2 = (n: number): number => Math.round(n * 100) / 100;
