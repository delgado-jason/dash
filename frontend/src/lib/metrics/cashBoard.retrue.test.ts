import { describe, it, expect } from "vitest";
import { buildCashBoard, accrualForWeek, type CashBoardInput, type CashCheck } from "./cashBoard";
import type { OdometerReading } from "./odometer";
import type { Load } from "@/types/load";

// Closed weeks re-true on the board (Nod Sheet 2026-11-04, call 8): a week a
// snapshot already accrued reads the miles that MOVED, dated the day they
// moved; what the chain says beyond them is one catch-up line on the next
// Friday — the same figure the Plan orders.
//
// Wed Nov 4, 2026. The Nov 1 snapshot is the Ops number. Six weeks accrued
// (Sep 16 – Oct 27) storing 8,052 mi; the chain says 9,972. The owed week
// Oct 28 – Nov 3 reads 823 by odometer.
const r = (date: string, reading: number): OdometerReading => ({ date, reading, source: "fuel", ref: date });
const readings: OdometerReading[] = [
  r("2026-09-15", 600000), r("2026-09-22", 602973), r("2026-09-29", 605224), r("2026-10-06", 607071),
  r("2026-10-13", 609926), r("2026-10-20", 609972), r("2026-10-27", 609972), r("2026-11-03", 610795),
];
const accruals = [
  { as_of: "2026-09-25", miles: 1999, pay_week_start: "2026-09-16" },
  { as_of: "2026-10-01", miles: 1999, pay_week_start: "2026-09-23" },
  { as_of: "2026-10-09", miles: 1847, pay_week_start: "2026-09-30" },
  { as_of: "2026-10-16", miles: 2207, pay_week_start: "2026-10-07" },
  { as_of: "2026-10-23", miles: 0, pay_week_start: "2026-10-14" },
  { as_of: "2026-11-01", miles: 0, pay_week_start: "2026-10-21" },
];
const NOV1: CashCheck = { date: "2026-11-01", balance: 6979, kind: "snapshot", note: null };
const input = (over: Partial<CashBoardInput> = {}): CashBoardInput => ({
  today: "2026-11-04", settlementDay: 3, depositLagDays: 1, floatLine: 10000,
  checks: [NOV1], loads: [] as Load[], settlements: [], fuelEntries: [], obligations: [],
  readings, weeklyPayroll: 0, perMile: 0.32, fuelPaceWeekly: null, fuelFallback: 0, advanceDefault: 0,
  buckets: { firstOfMonth: 0, standard: 0, samples: 0 }, deductionsFallback: 0, weeklyRevenueFallback: 0,
  moneyDays: [], overrides: {}, accruals,
  ...over,
});
const OCT7 = { start: "2026-10-07", end: "2026-10-13" };
const OCT14 = { start: "2026-10-14", end: "2026-10-20" };
const OCT28 = { start: "2026-10-28", end: "2026-11-03" };

describe("accrualForWeek — a week that already accrued reads the miles that moved, dated the day they moved", () => {
  it("Oct 7–13: 2,207 mi moved with the Oct 16 snapshot, not the chain's 2,855", () => {
    const a = accrualForWeek(input(), OCT7, NOV1);
    expect(a).toMatchObject({ source: "snapshot", miles: 2207, date: "2026-10-16", counted: false });
    expect(a.amount).toBeCloseTo(706.24, 2);
    expect(a.words).toContain("2,207 mi moved with the Oct 16 snapshot");
    expect(a.words).toContain("the chain now says 2,855");
  });

  it("a week accrued at 0 mi stays a $0 line — the chain's 46 ride in the catch-up, not here", () => {
    const a = accrualForWeek(input(), OCT14, NOV1);
    expect(a).toMatchObject({ source: "snapshot", miles: 0, amount: 0, date: "2026-10-23" });
  });

  it("the owed week is not a snapshot week: it still reads the chain and lands the Friday after it closes", () => {
    const a = accrualForWeek(input(), OCT28, NOV1);
    expect(a).toMatchObject({ source: "odometer", miles: 823, date: "2026-11-06", counted: true });
  });

  it("a week accrued WITH a later snapshot (a skipped Friday) is booked at 0 on its own, with the words saying so", () => {
    const skipped = [
      { as_of: "2026-09-25", miles: 1999, pay_week_start: "2026-09-16" },
      { as_of: "2026-10-09", miles: 4098, pay_week_start: "2026-09-30" },
    ];
    const a = accrualForWeek(input({ accruals: skipped }), { start: "2026-09-23", end: "2026-09-29" }, NOV1);
    expect(a).toMatchObject({ source: "snapshot", miles: 0, date: "2026-10-09" });
    expect(a.words).toContain("accrued with the Oct 9 snapshot");
  });

  it("counts against the Ops number by the move's own day: a snapshot dated the move holds it, an earlier check does not", () => {
    const sameDay: CashCheck = { date: "2026-10-16", balance: 1, kind: "snapshot", note: null };
    const earlier: CashCheck = { date: "2026-10-15", balance: 1, kind: "check", note: null };
    expect(accrualForWeek(input(), OCT7, sameDay).counted).toBe(false);
    expect(accrualForWeek(input(), OCT7, earlier).counted).toBe(true);
  });

  it("without the accruals the board behaves as before — the chain, the Friday after", () => {
    const a = accrualForWeek(input({ accruals: undefined }), OCT7, NOV1);
    expect(a).toMatchObject({ source: "odometer", miles: 2855, date: "2026-10-16" });
  });
});

describe("buildCashBoard — the catch-up: 1,920 mi × $0.32 on Fri Nov 6, in the current column", () => {
  it("lands $614.40 on the next Friday, counted, in the ending and the lowest day", () => {
    const b = buildCashBoard(input())!;
    const cu = b.columns[0].catchUp!;
    expect(cu).toMatchObject({ date: "2026-11-06", counted: true, miles: 1920 });
    expect(cu.amount).toBeCloseTo(614.4, 2);
    expect(cu.words).toContain("1,920 mi the chain found after the fact — Sep 16–Oct 27 moved 8,052 mi, the odometer says 9,972");
    expect(b.columns[1].catchUp).toBeNull();
    // Nov 1 Ops $6,979 − the owed week's $263.36 (Fri Nov 6) − the catch-up $614.40 (Fri Nov 6)
    expect(b.columns[0].ending).toBeCloseTo(6979 - 823 * 0.32 - 614.4, 2);
    expect(b.lowest).toEqual({ amount: Math.round((6979 - 823 * 0.32 - 614.4) * 100) / 100, date: "2026-11-06" });
  });

  it("falls in the next column when today is already past Friday", () => {
    const b = buildCashBoard(input({ today: "2026-11-07", checks: [{ ...NOV1, date: "2026-11-06", balance: 6979 }] }))!;
    expect(b.columns[0].catchUp).toBeNull();
    expect(b.columns[1].catchUp).toMatchObject({ date: "2026-11-13", counted: true, miles: 1920 });
  });

  it("over-accrued weeks make a hold-back: a negative line that leaves money in Ops", () => {
    const over = accruals.map((a) => (a.as_of === "2026-10-16" ? { ...a, miles: 2207 + 1920 + 500 } : a));
    const b = buildCashBoard(input({ accruals: over }))!;
    const cu = b.columns[0].catchUp!;
    expect(cu.miles).toBe(-500);
    expect(cu.amount).toBeCloseTo(-160, 2);
    expect(cu.words).toContain("500 mi over-accrued");
    expect(b.columns[0].ending).toBeCloseTo(6979 - 823 * 0.32 + 160, 2);
  });

  it("nothing to re-true → no line; no accruals given → no line", () => {
    const square = accruals.map((a) => (a.as_of === "2026-10-16" ? { ...a, miles: 2207 + 1920 } : a));
    expect(buildCashBoard(input({ accruals: square }))!.columns[0].catchUp).toBeNull();
    expect(buildCashBoard(input({ accruals: undefined }))!.columns[0].catchUp).toBeNull();
  });

  it("a snapshot that already holds the move keeps it out of the since-rows; an Ops number before the move counts it", () => {
    // The Oct 16 snapshot is the number: its own Oct 7–13 move is inside it.
    const oct16 = buildCashBoard(input({ today: "2026-10-20", checks: [{ date: "2026-10-16", balance: 9000, kind: "snapshot", note: null }] }))!;
    expect(oct16.columns[0].since.some((p) => p.week.start === "2026-10-07" && p.accrual)).toBe(false);
    // An OPS NOW check from the Monday before: the Oct 16 move is still ahead of it.
    const oct12 = buildCashBoard(input({ today: "2026-10-20", checks: [{ date: "2026-10-12", balance: 9000, kind: "check", note: null }] }))!;
    const row = oct12.columns[0].since.find((p) => p.week.start === "2026-10-07")!;
    expect(row.accrual).toMatchObject({ source: "snapshot", miles: 2207, date: "2026-10-16" });
  });
});
