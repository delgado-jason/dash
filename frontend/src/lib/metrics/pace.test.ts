import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import {
  monthPace,
  perDayOutOver,
  floorAtMiles,
  daysInMonth,
  daysOutIn,
  contributionPerDayOut,
  forgoneOverDays,
} from "./pace";

// Every date here is explicit — the module takes `today` as an argument rather
// than reading a clock, so these never rot as the calendar advances.
const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_number: "1",
    load_status: "delivered",
    delivery_date: "2026-11-05",
    loaded_miles: 500,
    // Odometer readings must start above zero — monthMiles treats a zero as no
    // reading at all.
    odometer_start: 100_000,
    odometer_end: 100_500,
    linehaul: "2000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as Load;

/** A delivered load contributing exactly `driven` miles in the given month. */
const drove = (date: string, driven: number, from = 100_000): Load =>
  load({
    load_id: `l-${date}-${driven}`,
    delivery_date: date,
    odometer_start: from,
    odometer_end: from + driven,
    loaded_miles: driven,
  });

const NO_TRIPS: Trip[] = [];

describe("daysInMonth", () => {
  it("knows the short months and the leap year", () => {
    expect(daysInMonth(new Date("2026-11-11T00:00:00Z"))).toBe(30);
    expect(daysInMonth(new Date("2026-12-01T00:00:00Z"))).toBe(31);
    expect(daysInMonth(new Date("2026-02-10T00:00:00Z"))).toBe(28);
    expect(daysInMonth(new Date("2028-02-10T00:00:00Z"))).toBe(29);
  });
});

describe("monthPace — the month in progress", () => {
  // Jason's real November, through the 11th: 3,105 driven miles, no home days.
  const nov = [drove("2026-11-03", 1200), drove("2026-11-07", 1905, 200_000)];
  const today = new Date("2026-11-11T00:00:00Z");

  it("measures the month against the commitment", () => {
    const p = monthPace(nov, NO_TRIPS, [], [], today, 7500);
    expect(p.miles).toBe(3105);
    expect(p.target).toBe(7500);
    expect(p.pctOfTarget).toBeCloseTo(0.414, 3);
    expect(p.daysElapsed).toBe(11);
  });

  it("miles per day OUT ignores home time entirely", () => {
    const noHome = monthPace(nov, NO_TRIPS, [], [], today, 7500);
    expect(noHome.daysOut).toBe(11);
    expect(noHome.milesPerDayOut).toBeCloseTo(3105 / 11, 5); // 282

    // Four days of that stretch were spent at home. The SAME miles over fewer
    // working days must read as running HARDER, never as a worse month.
    const withHome = monthPace(
      nov,
      NO_TRIPS,
      ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"],
      [],
      today,
      7500,
    );
    expect(withHome.daysOut).toBe(7);
    expect(withHome.milesPerDayOut).toBeCloseTo(3105 / 7, 5); // 444
    expect(withHome.milesPerDayOut!).toBeGreaterThan(noHome.milesPerDayOut!);
  });

  it("home days in OTHER months never touch this month's count", () => {
    const p = monthPace(nov, NO_TRIPS, ["2026-10-20", "2026-10-31", "2026-12-01"], [], today, 7500);
    expect(p.daysOut).toBe(11);
  });

  it("projects the month over the days still to be worked", () => {
    const p = monthPace(nov, NO_TRIPS, [], [], today, 7500);
    // 282/day × the 19 days left in November, on top of the 3,105 already run.
    expect(p.daysOutLeft).toBe(19);
    expect(p.landsAt).toBeCloseTo(3105 + (3105 / 11) * 19, 5); // 8,468
    expect(p.landsAtPctOfTarget).toBeGreaterThan(1);
  });

  it("THE SPLIT THAT MATTERS: below your own pace, still above target", () => {
    // November '26 exactly — running under the trailing average while still
    // projecting over the commitment, because no home days were taken. The two
    // readouts must be free to disagree.
    const octLoads = [drove("2026-10-15", 9660, 50_000)]; // 322/day over 30 days
    const p = monthPace([...nov, ...octLoads], NO_TRIPS, [], [], today, 7500, 1);
    expect(p.milesPerDayOut!).toBeLessThan(p.trailingPerDayOut!); // 282 < 322
    expect(p.landsAt!).toBeGreaterThan(p.target!); // 8,468 > 7,500
  });

  it("planned home days shorten the projection, and only the ones still ahead", () => {
    const planned = ["2026-11-20", "2026-11-21", "2026-11-22"];
    const p = monthPace(nov, NO_TRIPS, [], planned, today, 7500);
    expect(p.daysOutLeft).toBe(16); // 19 − 3
    expect(p.landsAt).toBeCloseTo(3105 + (3105 / 11) * 16, 5);

    // A planned day already in the past is elapsed, not "still to come" —
    // counting it again would shorten the month twice.
    const pastPlan = monthPace(nov, NO_TRIPS, [], ["2026-11-02", "2026-11-20"], today, 7500);
    expect(pastPlan.daysOutLeft).toBe(18); // only the 20th is ahead
  });

  it("planned days in another month are ignored", () => {
    const p = monthPace(nov, NO_TRIPS, [], ["2026-12-05", "2026-12-06"], today, 7500);
    expect(p.daysOutLeft).toBe(19);
  });

  it("no commitment → the miles still read, the comparisons go null", () => {
    const p = monthPace(nov, NO_TRIPS, [], [], today, null);
    expect(p.miles).toBe(3105);
    expect(p.target).toBeNull();
    expect(p.pctOfTarget).toBeNull();
    expect(p.landsAtPctOfTarget).toBeNull();
    expect(p.milesPerDayOut).not.toBeNull(); // this one never needed a target
  });

  it("a zero or negative commitment is treated as none, never divided by", () => {
    for (const bad of [0, -7500]) {
      const p = monthPace(nov, NO_TRIPS, [], [], today, bad);
      expect(p.target).toBeNull();
      expect(p.pctOfTarget).toBeNull();
    }
  });

  it("a month entirely at home reports no pace rather than zero", () => {
    const allHome = Array.from({ length: 11 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    const p = monthPace([], NO_TRIPS, allHome, [], today, 7500);
    expect(p.daysOut).toBe(0);
    // Null, not 0 — "nowhere to measure" is not "ran nothing".
    expect(p.milesPerDayOut).toBeNull();
    expect(p.landsAt).toBeNull();
  });

  it("the first day of the month does not divide by zero", () => {
    const p = monthPace([], NO_TRIPS, [], [], new Date("2026-11-01T00:00:00Z"), 7500);
    expect(p.daysElapsed).toBe(1);
    expect(p.daysOut).toBe(1);
    expect(p.milesPerDayOut).toBe(0);
    expect(p.landsAt).toBe(0);
  });

  it("the last day of the month leaves nothing to project", () => {
    const p = monthPace(nov, NO_TRIPS, [], [], new Date("2026-11-30T00:00:00Z"), 7500);
    expect(p.daysOutLeft).toBe(0);
    expect(p.landsAt).toBeCloseTo(3105, 5); // what has run IS the month
  });
});

describe("perDayOutOver — the trailing pace", () => {
  it("totals miles over days out across the window, not an average of averages", () => {
    const loads = [drove("2026-09-10", 9000, 10_000), drove("2026-10-10", 3000, 60_000)];
    // September: 30 days, none home. October: 31 days, 21 home → 10 out.
    const home = Array.from({ length: 21 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const months = [
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ];
    expect(perDayOutOver(loads, NO_TRIPS, home, months)).toBeCloseTo(12000 / 40, 5);
  });

  it("no months, or every day at home, reports null rather than zero", () => {
    expect(perDayOutOver([], NO_TRIPS, [], [])).toBeNull();
    const allOct = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    expect(perDayOutOver([], NO_TRIPS, allOct, [{ year: 2026, month: 9 }])).toBeNull();
  });
});

describe("daysOutIn", () => {
  const SEP = { year: 2026, month: 8 }; // 30 days
  const OCT = { year: 2026, month: 9 }; // 31 days

  it("counts every day of every month that was not at home", () => {
    expect(daysOutIn([SEP, OCT], [])).toBe(61);
    expect(daysOutIn([SEP, OCT], ["2026-10-01", "2026-10-02", "2026-09-30"])).toBe(58);
  });

  it("ignores home days outside the months given", () => {
    expect(daysOutIn([OCT], ["2026-09-15", "2026-11-01", "2026-10-05"])).toBe(30);
  });

  it("no months means no days", () => {
    expect(daysOutIn([], ["2026-10-01"])).toBe(0);
  });
});

describe("contributionPerDayOut — what a moving day is worth", () => {
  it("is the day's miles times what each one keeps after fuel and wear", () => {
    // Jason's real figures: 322 miles a day out, $3.71 net a mile, $1.59 of
    // variable cost — about $682 a day.
    expect(contributionPerDayOut(322, 3.71, 1.59)).toBeCloseTo(682.64, 2);
  });

  it("never goes negative — a losing mile does not make sitting profitable", () => {
    expect(contributionPerDayOut(322, 1.0, 1.59)).toBe(0);
  });

  it("needs all three inputs, and a day that drove nothing is not measurable", () => {
    expect(contributionPerDayOut(null, 3.71, 1.59)).toBeNull();
    expect(contributionPerDayOut(322, null, 1.59)).toBeNull();
    expect(contributionPerDayOut(322, 3.71, null)).toBeNull();
    expect(contributionPerDayOut(0, 3.71, 1.59)).toBeNull();
    expect(contributionPerDayOut(-10, 3.71, 1.59)).toBeNull();
  });
});

describe("forgoneOverDays — the real price of a stretch at home", () => {
  it("is the days off times what each one would have earned", () => {
    expect(forgoneOverDays(14, 682)).toBeCloseTo(9548, 2);
    expect(forgoneOverDays(46, 682)).toBeCloseTo(31372, 2); // six months of home time
  });

  it("is null when a day out cannot be priced, and zero days cost nothing", () => {
    expect(forgoneOverDays(14, null)).toBeNull();
    expect(forgoneOverDays(0, 682)).toBeNull();
    expect(forgoneOverDays(-3, 682)).toBeNull();
  });

  it("DWARFS the money that merely drafts — the whole point of the change", () => {
    // A fortnight: about $386/day of bills and payroll draft whether the truck
    // moves or not; the earning that does not happen is roughly $682 a day.
    const drafts = 14 * 386;
    const forgone = forgoneOverDays(14, 682)!;
    expect(forgone).toBeGreaterThan(drafts);
    // Pricing only the drafts showed home time at roughly a third of its cost.
    expect(drafts / (drafts + forgone)).toBeLessThan(0.4);
  });
});

describe("floorAtMiles — the warning, never a price", () => {
  // $11,314 = $9,354/mo fixed operating + $1,960 of notes. The notes figure is
  // PRINCIPAL only (obligations.amount), never the full bank draft — the loans'
  // interest is already a P&L expense, so the whole payment would count it twice.
  it("reproduces the real curve: $11,314 fixed, $1.59/mi, 75.93% keep", () => {
    const f = (m: number) => floorAtMiles(11314, 1.59, 0.7593, m);
    expect(f(5000)).toBeCloseTo(5.07, 2);
    expect(f(7500)).toBeCloseTo(4.08, 2);
    expect(f(9000)).toBeCloseTo(3.75, 2);
    expect(f(10000)).toBeCloseTo(3.58, 2);
  });

  it("the floor falls as miles rise — that is the whole finding", () => {
    const low = floorAtMiles(11314, 1.59, 0.7593, 5000)!;
    const high = floorAtMiles(11314, 1.59, 0.7593, 10000)!;
    expect(low).toBeGreaterThan(high);
  });

  it("refuses to divide by nothing", () => {
    expect(floorAtMiles(11314, 1.59, 0.7593, 0)).toBeNull();
    expect(floorAtMiles(11314, 1.59, 0.7593, -100)).toBeNull();
    expect(floorAtMiles(11314, 1.59, 0, 7500)).toBeNull();
    expect(floorAtMiles(null, 1.59, 0.7593, 7500)).toBeNull();
    expect(floorAtMiles(11314, null, 0.7593, 7500)).toBeNull();
    expect(floorAtMiles(11314, 1.59, 0.7593, null)).toBeNull();
  });
});
