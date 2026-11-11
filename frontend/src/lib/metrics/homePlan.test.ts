import { describe, it, expect } from "vitest";
import { daysOfWeek, onRoadShare, isHomeWeek, homeCost, weeksOffByMonth, weeksOffIsDerived, fortnightOptions, cheapest } from "./homePlan";
import type { PayWeek } from "./payWeeks";

// A pay week runs Wednesday to Tuesday, inclusive of both ends.
const week = (start: string, end: string): PayWeek => ({ start, end });
const DEC23 = week("2026-12-23", "2026-12-29");
const DEC16 = week("2026-12-16", "2026-12-22");

describe("daysOfWeek", () => {
  it("walks both ends inclusive — seven days, not six", () => {
    expect(daysOfWeek(DEC23)).toEqual([
      "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26",
      "2026-12-27", "2026-12-28", "2026-12-29",
    ]);
  });

  it("crosses a month boundary without losing a day", () => {
    expect(daysOfWeek(week("2026-12-30", "2027-01-05"))).toEqual([
      "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
      "2027-01-03", "2027-01-04", "2027-01-05",
    ]);
  });

  it("refuses to spin on a backwards week", () => {
    expect(daysOfWeek(week("2026-12-29", "2026-12-23"))).toEqual([]);
  });
});

describe("onRoadShare — how much of the week is still work", () => {
  it("is 1 when nothing is planned", () => {
    expect(onRoadShare(DEC23, [])).toBe(1);
  });

  it("is 0 when every day is planned home — the case the sheet drew", () => {
    expect(onRoadShare(DEC23, daysOfWeek(DEC23))).toBe(0);
    expect(isHomeWeek(DEC23, daysOfWeek(DEC23))).toBe(true);
  });

  it("scales a partial week instead of needing a threshold", () => {
    // Three days home out of seven: four sevenths of a working week left.
    const share = onRoadShare(DEC23, ["2026-12-23", "2026-12-24", "2026-12-25"]);
    expect(share).toBeCloseTo(4 / 7, 10);
    expect(isHomeWeek(DEC23, ["2026-12-23", "2026-12-24", "2026-12-25"])).toBe(false);
  });

  it("ignores planned days that fall in OTHER weeks", () => {
    // The whole of the 16th–22nd planned home must not touch the 23rd–29th.
    expect(onRoadShare(DEC23, daysOfWeek(DEC16))).toBe(1);
  });

  it("counts a day once, however many times it was listed", () => {
    expect(onRoadShare(DEC23, ["2026-12-23", "2026-12-23", "2026-12-23"])).toBeCloseTo(6 / 7, 10);
  });

  it("accepts a full timestamp as well as a day key", () => {
    expect(onRoadShare(DEC23, ["2026-12-23T00:00:00.000Z"])).toBeCloseTo(6 / 7, 10);
  });

  it("is 1 on a malformed week rather than dividing by zero", () => {
    expect(onRoadShare(week("2026-12-29", "2026-12-23"), ["2026-12-25"])).toBe(1);
  });
});

describe("homeCost — what a fortnight at home costs, by where it falls", () => {
  // Jason's bills cluster: the truck note (26th), the guarantee fee (27th),
  // the trailer (27th) and the phone (29th) all land in the last week of the
  // month. The sheet measured the swing at $2,959 for the identical fortnight;
  // these fixtures are its figures, so the number is reproduced rather than
  // asserted.
  const BILLS: Record<string, number> = {
    "2026-12-02": 836.48,
    "2026-12-09": 115.0,
    "2026-12-16": 619.4,
    "2026-12-23": 3291.19,
  };
  const billsInWeek = (w: PayWeek) => BILLS[w.start] ?? 0;
  const PAYROLL = 1908;

  const DEC2 = week("2026-12-02", "2026-12-08");
  const DEC9 = week("2026-12-09", "2026-12-15");

  it("adds the bills that draft to the payroll that always drafts", () => {
    const early = homeCost([DEC2, DEC9], PAYROLL, billsInWeek);
    expect(early.weeks[0].out).toBeCloseTo(2744.48, 2);
    expect(early.weeks[1].out).toBeCloseTo(2023.0, 2);
    expect(early.total).toBeCloseTo(4767.48, 2);
  });

  it("prices the SAME fortnight differently when it lands on the bills", () => {
    const late = homeCost([DEC16, DEC23], PAYROLL, billsInWeek);
    expect(late.weeks[0].out).toBeCloseTo(2527.4, 2);
    expect(late.weeks[1].out).toBeCloseTo(5199.19, 2);
    expect(late.total).toBeCloseTo(7726.59, 2);

    const early = homeCost([DEC2, DEC9], PAYROLL, billsInWeek);
    // The finding the whole sheet turns on, to the cent.
    expect(late.total - early.total).toBeCloseTo(2959.11, 2);
  });

  it("treats a missing payroll as nothing rather than refusing", () => {
    // The bills still draft when the planning figure is blank; the cash board
    // is the surface that refuses out loud about a missing input, not this.
    const c = homeCost([DEC23], null, billsInWeek);
    expect(c.total).toBeCloseTo(3291.19, 2);
  });

  it("is zero over no weeks at all", () => {
    expect(homeCost([], PAYROLL, billsInWeek).total).toBe(0);
  });
});

describe("weeksOffByMonth — measured beats typed, typed beats nothing", () => {
  const MONTHS = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"];
  const days = (month: string, n: number): string[] =>
    Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

  it("measures a PAST month from the days he actually was home", () => {
    // Prod, 2026-11-10: August carries 8 home marks and no typed figure at
    // all, so the baseline has been counting it as a full working month.
    const w = weeksOffByMonth(days("2026-08", 8), [], new Map(), MONTHS);
    expect(w.get("2026-08-01")).toBeCloseTo(1.14, 2);
  });

  it("measures a FUTURE month from the days he plans to be home", () => {
    const w = weeksOffByMonth([], days("2026-12", 14), new Map(), MONTHS);
    expect(w.get("2026-12-01")).toBe(2);
  });

  it("the measured figure REPLACES a typed one that disagrees", () => {
    // October: typed 2.00 against eighteen marked home days.
    const w = weeksOffByMonth(days("2026-10", 18), [], new Map([["2026-10-01", 2]]), MONTHS);
    expect(w.get("2026-10-01")).toBeCloseTo(2.57, 2);
  });

  it("keeps a typed figure for a month with nothing marked", () => {
    // December is typed 1.00 with no days marked yet. Deriving strictly would
    // silently drop a plan he made.
    const w = weeksOffByMonth([], [], new Map([["2026-12-01", 1]]), MONTHS);
    expect(w.get("2026-12-01")).toBe(1);
  });

  it("counts both halves of the month he is living through", () => {
    // Two days already home, five more planned: one whole week, not two parts.
    const w = weeksOffByMonth(
      ["2026-11-02", "2026-11-03"],
      ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"],
      new Map(),
      MONTHS,
    );
    expect(w.get("2026-11-01")).toBe(1);
  });

  it("a month with neither marks nor a typed figure is simply absent", () => {
    const w = weeksOffByMonth([], [], new Map(), MONTHS);
    expect(w.has("2026-09-01")).toBe(false);
  });

  it("a typed ZERO does not mask the absence of data", () => {
    // Jason has November typed 0.00. That is not a claim he was never home —
    // it is the default. An absent entry reads the same to the forecast.
    const w = weeksOffByMonth([], [], new Map([["2026-11-01", 0]]), MONTHS);
    expect(w.get("2026-11-01") ?? 0).toBe(0);
  });

  it("says which months were measured and which were typed", () => {
    expect(weeksOffIsDerived("2026-10-01", days("2026-10", 18), [])).toBe(true);
    expect(weeksOffIsDerived("2026-12-01", days("2026-10", 18), [])).toBe(false);
  });
});

describe("fortnightOptions — the same two weeks, priced where they fall", () => {
  // December 2026 pay weeks (Wed–Tue) and Jason's real bill clusters.
  const WEEKS: PayWeek[] = [
    week("2026-12-02", "2026-12-08"),
    week("2026-12-09", "2026-12-15"),
    week("2026-12-16", "2026-12-22"),
    week("2026-12-23", "2026-12-29"),
  ];
  const BILLS: Record<string, number> = {
    "2026-12-02": 836.48, "2026-12-09": 115.0,
    "2026-12-16": 619.4, "2026-12-23": 3291.19,
  };
  const billsInWeek = (w: PayWeek) => BILLS[w.start] ?? 0;
  const PAYROLL = 1908;
  // Chosen start = Dec 16, so shift −1 is Dec 9 and +1 is Dec 23.
  const weekAt = (offset: number): PayWeek => WEEKS[2 + offset] ?? WEEKS[WEEKS.length - 1];

  it("prices the chosen fortnight and both neighbours", () => {
    const opts = fortnightOptions(weekAt, 2, PAYROLL, billsInWeek);
    expect(opts.map((o) => o.shift)).toEqual([-1, 0, 1]);
    // Dec 16–29, the one he picked: the bill-heavy fortnight.
    expect(opts[1].cost.total).toBeCloseTo(7726.59, 2);
    // A week earlier (Dec 9–22) dodges the cluster:
    // (115.00 + 1908) + (619.40 + 1908) = 4550.40.
    expect(opts[0].cost.total).toBeCloseTo(4550.4, 2);
  });

  it("the delta is what MOVING it costs, and is zero for the chosen one", () => {
    const opts = fortnightOptions(weekAt, 2, PAYROLL, billsInWeek);
    expect(opts[1].delta).toBe(0);
    expect(opts[0].delta).toBeCloseTo(-3176.19, 2); // a week earlier saves this
  });

  it("names the cheapest option", () => {
    const opts = fortnightOptions(weekAt, 2, PAYROLL, billsInWeek);
    expect(cheapest(opts)?.shift).toBe(-1);
  });

  it("handles a one-week stretch", () => {
    const opts = fortnightOptions(weekAt, 1, PAYROLL, billsInWeek);
    expect(opts[1].weeks).toHaveLength(1);
    expect(opts[1].cost.total).toBeCloseTo(2527.4, 2);
  });

  it("never asks for zero weeks", () => {
    const opts = fortnightOptions(weekAt, 0, PAYROLL, billsInWeek);
    expect(opts[1].weeks).toHaveLength(1);
  });

  it("is empty when no shifts are asked for", () => {
    expect(fortnightOptions(weekAt, 2, PAYROLL, billsInWeek, [])).toEqual([]);
    expect(cheapest([])).toBeNull();
  });
});
