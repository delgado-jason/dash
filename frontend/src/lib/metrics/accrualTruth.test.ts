import { describe, it, expect } from "vitest";
import { accrualsByWeek, retrueAccrued, retrueWords, type AccrualRecord } from "./accrualTruth";
import type { OdometerReading } from "./odometer";

// Prod as it stood on Nov 4, 2026 (the audit's six accrued weeks, in miles
// stored on the snapshots) against a chain that grew after the fact.
const records: AccrualRecord[] = [
  { as_of: "2026-09-18", miles: null, pay_week_start: null }, // a plain Friday — no accrual
  { as_of: "2026-09-25", miles: "1999", pay_week_start: "2026-09-16" },
  { as_of: "2026-10-01", miles: "1999", pay_week_start: "2026-09-23" },
  { as_of: "2026-10-09", miles: 1847, pay_week_start: "2026-09-30" },
  { as_of: "2026-10-16", miles: 2207, pay_week_start: "2026-10-07" },
  { as_of: "2026-10-23", miles: 0, pay_week_start: "2026-10-14" },
  { as_of: "2026-11-01", miles: 0, pay_week_start: "2026-10-21" },
];
const r = (date: string, reading: number): OdometerReading => ({ date, reading, source: "fuel", ref: date });
// One reading at each week boundary, so each week's chain miles are plain.
const readings: OdometerReading[] = [
  r("2026-09-15", 600000),
  r("2026-09-22", 602973), // Sep 16–22: 2,973 (stored 1,999)
  r("2026-09-29", 605224), // Sep 23–29: 2,251 (stored 1,999)
  r("2026-10-06", 607071), // Sep 30–Oct 6: 1,847 (stored 1,847)
  r("2026-10-13", 609926), // Oct 7–13: 2,855 (stored 2,207)
  r("2026-10-20", 609972), // Oct 14–20: 46 (stored 0)
  r("2026-10-27", 609972), // Oct 21–27: 0 (stored 0)
  r("2026-11-03", 610795), // Oct 28–Nov 3: 823 — owed, not accrued, never re-trued
];

describe("accrualsByWeek — each snapshot's miles sit on the latest week it covered", () => {
  it("maps the six accrued weeks to the snapshot that moved them", () => {
    const m = accrualsByWeek(records);
    expect([...m.keys()].sort()).toEqual(["2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21"]);
    expect(m.get("2026-10-07")).toEqual({ stored: 2207, movedOn: "2026-10-16", own: true });
  });

  it("a snapshot that covered two closed weeks: the earlier one accrued with it at 0 miles", () => {
    const m = accrualsByWeek([
      { as_of: "2026-09-25", miles: 1999, pay_week_start: "2026-09-16" },
      { as_of: "2026-10-09", miles: 4000, pay_week_start: "2026-09-30" }, // skipped the Oct 2 Friday
    ]);
    expect(m.get("2026-09-23")).toEqual({ stored: 0, movedOn: "2026-10-09", own: false });
    expect(m.get("2026-09-30")).toEqual({ stored: 4000, movedOn: "2026-10-09", own: true });
  });

  it("a Friday re-typed twice for the same week: both moves count", () => {
    const m = accrualsByWeek([
      { as_of: "2026-09-25", miles: 1000, pay_week_start: "2026-09-16" },
      { as_of: "2026-09-25", miles: 999, pay_week_start: "2026-09-16" },
    ]);
    expect(m.get("2026-09-16")!.stored).toBe(1999);
  });
});

describe("retrueAccrued — Σ stored = Σ chain over every accrued week, the difference is the catch-up", () => {
  it("reproduces the audit: Sep 16–Oct 27 moved 8,052 mi, the chain says 9,972 → 1,920 mi never accrued", () => {
    const t = retrueAccrued(records, readings, [], "2026-11-04")!;
    expect(t.label).toBe("Sep 16–Oct 27");
    expect(t.storedMiles).toBe(8052);
    expect(t.chainMiles).toBe(9972);
    expect(t.deltaMiles).toBe(1920);
    expect(t.byLoads).toBe(0);
    expect(t.weeks.map((w) => [w.week.start, w.chain, w.stored])).toEqual([
      ["2026-09-16", 2973, 1999], ["2026-09-23", 2251, 1999], ["2026-09-30", 1847, 1847],
      ["2026-10-07", 2855, 2207], ["2026-10-14", 46, 0], ["2026-10-21", 0, 0],
    ]);
    expect(retrueWords(t)).toBe("1,920 mi the chain found after the fact — Sep 16–Oct 27 moved 8,052 mi, the odometer says 9,972");
  });

  it("the owed week is not re-trued — it hasn't accrued, so it accrues on its own", () => {
    const t = retrueAccrued(records, readings, [], "2026-11-04")!;
    expect(t.weeks.some((w) => w.week.start === "2026-10-28")).toBe(false);
  });

  it("the catch-up closes the gap once it is stored: the next snapshot's miles include it", () => {
    const after = [...records, { as_of: "2026-11-06", miles: 823 + 1920, pay_week_start: "2026-10-28" }];
    const t = retrueAccrued(after, readings, [], "2026-11-08")!;
    expect(t.label).toBe("Sep 16–Nov 3");
    expect(t.chainMiles).toBe(9972 + 823);
    expect(t.storedMiles).toBe(8052 + 823 + 1920);
    expect(t.deltaMiles).toBe(0);
    expect(retrueWords(t)).toBeNull();
  });

  it("a late reading at the span's end re-opens the gap by exactly the miles it adds", () => {
    const after = [...records, { as_of: "2026-11-06", miles: 823 + 1920, pay_week_start: "2026-10-28" }];
    // A trip-end logged late, dated Nov 3: the last accrued week's end reading
    // rises 200 (and the open week's start with it — that week will accrue
    // 200 less, which the catch-up makes whole).
    const late = [...readings, r("2026-11-03", 610995)];
    const t = retrueAccrued(after, late, [], "2026-11-08")!;
    expect(t.deltaMiles).toBe(200);
  });

  it("a late reading strictly inside the span moves miles between weeks and changes the total not at all", () => {
    // The chain over a span telescopes to its two boundary readings.
    const inside = [...readings, r("2026-10-20", 609950)]; // a home trip logged late, inside Oct 14–20
    const t = retrueAccrued(records, inside, [], "2026-11-04")!;
    expect(t.chainMiles).toBe(9972);
    expect(t.deltaMiles).toBe(1920);
  });

  it("moved more than the chain shows → over-accrued, a negative catch-up", () => {
    const under = retrueAccrued([{ as_of: "2026-09-25", miles: 2500, pay_week_start: "2026-09-16" }], readings, [], "2026-09-30")!;
    expect(under.deltaMiles).toBe(473);
    const over = retrueAccrued([{ as_of: "2026-09-25", miles: 3200, pay_week_start: "2026-09-16" }], readings, [], "2026-09-30")!;
    expect(over.deltaMiles).toBe(-227);
    expect(retrueWords(over)).toBe("227 mi over-accrued — Sep 16–22 moved 3,200 mi, the odometer says 2,973");
  });

  it("a week with no reading before it is read from the loads and named as such", () => {
    const loads = [{ load_number: "1", load_status: "delivered", pickup_date: "2026-09-17", loaded_miles: 1500, deadhead_miles: 300 }];
    const t = retrueAccrued([{ as_of: "2026-09-25", miles: 1800, pay_week_start: "2026-09-16" }], readings.slice(1), loads, "2026-09-30")!;
    expect(t.weeks[0]).toMatchObject({ chain: 1800, source: "loads", stored: 1800 });
    expect(t.byLoads).toBe(1);
    expect(t.deltaMiles).toBe(0);
  });

  it("miles stored without a week tag still count as moved — a catch-up typed on its own closes the gap", () => {
    const t = retrueAccrued([...records, { as_of: "2026-11-02", miles: 1920, pay_week_start: null }], readings, [], "2026-11-04")!;
    expect(t.deltaMiles).toBe(0);
  });

  it("null until something has accrued, and words are null when it nets to zero", () => {
    expect(retrueAccrued([{ as_of: "2026-09-18", miles: null, pay_week_start: null }], readings, [], "2026-11-04")).toBeNull();
    expect(retrueAccrued([], readings, [], "2026-11-04")).toBeNull();
    expect(retrueWords(null)).toBeNull();
  });
});
