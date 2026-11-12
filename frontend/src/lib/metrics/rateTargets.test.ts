import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import {
  getBookedAheadGross,
  getWeekGrossPipeline,
  loadNetRevenue,
  loadGross,
  completeMonthsBefore,
  getCostBasis,
  monthMiles,
  getRateLadder,
  bookedRate,
  getGrossTargets,
  payWeekRange,
  getWeekBookedGross,
  getWeekEarnedGross,
  getWeekRpm,
  getWindowRpm,
  monthlyObligationCost,
} from "./rateTargets";
import type { Obligation } from "@/types/obligation";

const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_number: "1",
    load_status: "delivered",
    delivery_date: "2026-05-15",
    loaded_miles: 1000,
    odometer_start: 0,
    odometer_end: 1200,
    linehaul: "2000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as Load;

const period = (month: string, cogs: number, expense: number): ExpensePeriod => ({
  period_id: month,
  period_month: month,
  period_label: month,
  income_total: null,
  cogs_total: cogs,
  expense_total: expense,
});

describe("loadRevenue / loadGross", () => {
  it("revenue = net_revenue (the owner-op's take); gross = gross_revenue (full rate)", () => {
    const l = load({
      linehaul: "5000",
      fuel_surcharge: "500",
      total_accessorials: "0",
      gross_revenue: "5500",
      net_revenue: "4150", // 5000*0.73 + 500
    });
    expect(loadNetRevenue(l)).toBe(4150);
    expect(loadGross(l)).toBe(5500);
  });

  it("falls back to the component sum when net/gross are absent (no schedule)", () => {
    const l = load({ linehaul: "5000", fuel_surcharge: "500", total_accessorials: "0" });
    expect(loadNetRevenue(l)).toBe(5500);
    expect(loadGross(l)).toBe(5500);
  });
});

describe("completeMonthsBefore", () => {
  it("excludes the current month and returns the 3 prior", () => {
    const months = completeMonthsBefore(new Date("2026-07-09T00:00:00Z"), 3);
    expect(months).toEqual([
      { year: 2026, month: 3 }, // Apr
      { year: 2026, month: 4 }, // May
      { year: 2026, month: 5 }, // Jun
    ]);
  });

  it("rolls over the year boundary", () => {
    const months = completeMonthsBefore(new Date("2026-02-10T00:00:00Z"), 3);
    expect(months).toEqual([
      { year: 2025, month: 10 }, // Nov
      { year: 2025, month: 11 }, // Dec
      { year: 2026, month: 0 }, // Jan
    ]);
  });
});

describe("getCostBasis", () => {
  const now = new Date("2026-07-09T00:00:00Z");

  it("blends true cost + miles over the 3 complete prior months", () => {
    const periods = [
      period("2026-04-01", 5000, 5000), // 10k operating
      period("2026-05-01", 5000, 5000),
      period("2026-06-01", 5000, 5000),
    ];
    const loads = [
      // Real readings: a zero start is a missing reading, not mile 0 (2026-11-04).
      load({ delivery_date: "2026-04-15", loaded_miles: 2000, odometer_start: 100000, odometer_end: 102500, linehaul: "8000" }),
      load({ delivery_date: "2026-05-15", loaded_miles: 2000, odometer_start: 102500, odometer_end: 105000, linehaul: "8000" }),
      load({ delivery_date: "2026-06-15", loaded_miles: 2000, odometer_start: 105000, odometer_end: 107500, linehaul: "8000" }),
      // current + future month loads must be ignored
      load({ delivery_date: "2026-07-15", loaded_miles: 9999, linehaul: "99999" }),
    ];
    // obligations 2000/mo → true monthly = 10k + 2k = 12k
    const b = getCostBasis(periods, 2000, loads, now, 3);
    expect(b.months).toBe(3);
    expect(b.trueMonthlyCost).toBeCloseTo(12000, 5);
    expect(b.loadedMiles).toBe(6000); // 3 × 2000
    expect(b.totalMiles).toBe(7500); // 3 × 2500
    // break-even = total true cost (36k) / loaded (6000) = 6.00
    expect(b.breakEvenRpm).toBeCloseTo(6.0, 5);
    // your rate = revenue (24k) / loaded (6000) = 4.00
    expect(b.windowRpm).toBeCloseTo(4.0, 5);
    // cost per TOTAL mile (deadhead included) = 36k / 7500 = 4.80
    expect(b.costPerTotalMile).toBeCloseTo(4.8, 5);
    // your gross rate per total mile = gross (24k) / 7500 = 3.20
    expect(b.grossPerTotalMile).toBeCloseTo(3.2, 5);
    // the window names its months — no more "where did this come from"
    expect(b.windowLabel).toBe("Apr–Jun ’26");
    expect(b.missingLabel).toBeNull();
    expect(b.monthsWanted).toBe(3);
    // each month on its own: 12k of true cost over 2,500 driven miles = $4.80
    expect(b.monthsDetail.map((m) => m.label)).toEqual(["Apr ’26", "May ’26", "Jun ’26"]);
    expect(b.monthsDetail.map((m) => m.costPerTotalMile)).toEqual([4.8, 4.8, 4.8]);
    expect(b.monthsDetail[0]).toMatchObject({ year: 2026, month: 3, cost: 12000, totalMiles: 2500 });
  });

  it("a month missing ONE section total is unfiled too — a missing section is not a $0 section", () => {
    const half = { ...period("2026-05-01", 5000, 5000), cogs_total: null } as ExpensePeriod;
    const b = getCostBasis([period("2026-04-01", 5000, 5000), half, period("2026-06-01", 5000, 5000)], 0, [], now, 3);
    expect(b.months).toBe(2);
    expect(b.missingLabel).toBe("May ’26");
  });

  it("a month saved without its totals is unfiled, never a free month", () => {
    const broken = { ...period("2026-05-01", 5000, 5000), cogs_total: null, expense_total: null } as ExpensePeriod;
    const b = getCostBasis([period("2026-04-01", 5000, 5000), broken, period("2026-06-01", 5000, 5000)], 0, [], now, 3);
    expect(b.months).toBe(2);
    expect(b.windowLabel).toBe("Apr, Jun ’26");
    expect(b.missingLabel).toBe("May ’26");
  });

  it("a six-month basis (BASIS_MONTHS) names six wanted months, filed or not, and a mile-less month carries no $/mi", () => {
    const b = getCostBasis([period("2026-05-01", 5000, 5000)], 0, [], now, 6);
    expect(b.monthsWanted).toBe(6);
    expect(b.windowLabel).toBe("May ’26");
    expect(b.missingLabel).toBe("Jan, Feb, Mar, Apr, Jun ’26");
    expect(b.monthsDetail).toEqual([{ year: 2026, month: 4, label: "May ’26", cost: 10000, totalMiles: 0, costPerTotalMile: null }]);
  });

  it("windowLabel: gaps list months, year boundaries carry both years, empty is null", () => {
    // Only May has a P&L → single month label.
    const may = getCostBasis([period("2026-05-01", 5000, 5000)], 0, [], now, 3);
    expect(may.windowLabel).toBe("May ’26");
    expect(may.missingLabel).toBe("Apr, Jun ’26"); // the months the window wanted and didn't get
    // Apr + Jun with May missing → a list, not a fake range.
    const gap = getCostBasis(
      [period("2026-04-01", 5000, 5000), period("2026-06-01", 5000, 5000)],
      0, [], now, 3,
    );
    expect(gap.windowLabel).toBe("Apr, Jun ’26");
    expect(gap.missingLabel).toBe("May ’26");
    // Nov–Jan across the year boundary → years on both ends.
    const wrap = getCostBasis(
      [period("2026-11-01", 5000, 5000), period("2026-12-01", 5000, 5000), period("2027-01-01", 5000, 5000)],
      0, [], new Date("2027-02-10T00:00:00Z"),
    );
    expect(wrap.windowLabel).toBe("Nov ’26–Jan ’27");
    // No P&L at all → null (surfaces fall back to the plain "3mo" wording).
    expect(getCostBasis([], 0, [], now, 3).windowLabel).toBeNull();
    expect(getCostBasis([], 0, [], now, 3).missingLabel).toBe("Apr–Jun ’26");
  });

  it("guards a reversed/equal odometer reading — contributes 0 driven miles, not negative", () => {
    const periods = [period("2026-06-01", 5000, 5000)]; // one complete month (June)
    const loads = [
      load({ delivery_date: "2026-06-10", loaded_miles: 1000, odometer_start: 1000, odometer_end: 3500, linehaul: "5000" }), // 2500 driven
      load({ delivery_date: "2026-06-20", loaded_miles: 800, odometer_start: 5000, odometer_end: 4000, linehaul: "4000" }), // reversed → 0, not −1000
    ];
    const b = getCostBasis(periods, 0, loads, now, 3);
    expect(b.totalMiles).toBe(2500); // without the guard it would read 1500
  });

  it("skips months with no P&L, keeping cost and miles aligned", () => {
    const periods = [period("2026-05-01", 5000, 5000)]; // only May
    const loads = [
      load({ delivery_date: "2026-04-15", loaded_miles: 5000 }), // Apr miles ignored (no P&L)
      load({ delivery_date: "2026-05-15", loaded_miles: 2000, linehaul: "8000" }),
    ];
    const b = getCostBasis(periods, 0, loads, now, 3);
    expect(b.months).toBe(1);
    expect(b.loadedMiles).toBe(2000); // only May
    expect(b.breakEvenRpm).toBeCloseTo(10000 / 2000, 5); // 5.00
  });

  it("the default window is BASIS_MONTHS — six — not the three it was (call 12, 2026-11-04)", () => {
    const b = getCostBasis([], 0, [], now);
    expect(b.monthsWanted).toBe(6);
    expect(b.missingLabel).toBe("Jan–Jun ’26");
    // Six P&L months, one cost each → the mean reads all six, not the last three.
    const six = ["01", "02", "03", "04", "05", "06"].map((m, i) => period(`2026-${m}-01`, 1000 * (i + 1), 0));
    expect(getCostBasis(six, 0, [], now).trueMonthlyCost).toBeCloseTo(3500, 5); // (1+2+3+4+5+6)k / 6
    expect(getCostBasis(six, 0, [], now, 3).trueMonthlyCost).toBeCloseTo(5000, 5); // the three-month blend
  });

  it("odometer spans are a UNION — two loads sharing a start count the shared miles once (DB-04, load 8126107)", () => {
    const periods = [period("2026-06-01", 5000, 5000)];
    const loads = [
      load({ delivery_date: "2026-06-15", loaded_miles: 500, odometer_start: 576184, odometer_end: 576836, linehaul: "3000" }), // 652 driven
      load({ delivery_date: "2026-06-17", loaded_miles: 1200, odometer_start: 576184, odometer_end: 577593, linehaul: "6000" }), // a copied start: 1,409 on its own, 757 beyond the first
      load({ delivery_date: "2026-06-25", loaded_miles: 100, odometer_start: 0, odometer_end: 577900, linehaul: "500" }), // a zero start is no reading at all
    ];
    const b = getCostBasis(periods, 0, loads, now);
    expect(b.totalMiles).toBe(577593 - 576184); // 1,409 — not 2,061
    expect(monthMiles(loads, 2026, 5).total).toBe(1409);
  });

  it("null break-even when there's no P&L history", () => {
    const b = getCostBasis([], 0, [], now, 3);
    expect(b.months).toBe(0);
    expect(b.trueMonthlyCost).toBeNull();
    expect(b.breakEvenRpm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE COMMITTED BASIS (migration 109)
//
// The floor used to be total cost ÷ the miles actually driven, which makes it
// a function of the outcome it governs: a slow month spreads the same fixed
// cost over fewer miles, so the floor RISES, which says quote higher, which
// books less freight. October '26 would have quoted $5.15 purely because
// October was slow. With a commitment the floor asks "what must a mile earn
// if I run the miles I promised?" and holds still.
// ---------------------------------------------------------------------------
describe("getCostBasis — the committed basis", () => {
  const now = new Date("2026-07-15T00:00:00Z"); // window: Apr, May, Jun

  /** A month with a fixed/variable split and a known number of driven miles. */
  const split = (month: string, fixed: number, variable: number): ExpensePeriod => ({
    period_id: month,
    period_month: month,
    period_label: month,
    income_total: null,
    cogs_total: 0,
    expense_total: fixed + variable,
    fixed_total: fixed,
    variable_total: variable,
  });
  // One load per month. The odometer must START above zero — monthMiles treats
  // a zero reading as no reading at all, so a span from 0 contributes nothing.
  const milesIn = (month: string, driven: number): Load =>
    load({
      load_id: `l-${month}`,
      delivery_date: `${month.slice(0, 7)}-15`,
      odometer_start: 100_000,
      odometer_end: 100_000 + driven,
      loaded_miles: driven,
    });

  const months = ["2026-04-01", "2026-05-01", "2026-06-01"];
  // $3,000 fixed + $2,000 variable a month, 1,000 driven miles a month.
  const periods = months.map((m) => split(m, 3000, 2000));
  const loads = months.map((m) => milesIn(m, 1000));

  it("divides fixed cost by the COMMITMENT, not by the miles actually driven", () => {
    // fixed 3,000/mo + 0 notes, over a 2,000-mile commitment = $1.50/mi,
    // plus variable 6,000 ÷ 3,000 driven miles = $2.00/mi → $3.50.
    const b = getCostBasis(periods, 0, loads, now, 3, [], 2000);
    expect(b.basisKind).toBe("committed");
    expect(b.targetMiles).toBe(2000);
    expect(b.fixedMonthly).toBeCloseTo(3000, 5);
    expect(b.variablePerMile).toBeCloseTo(2, 5);
    expect(b.costPerTotalMile).toBeCloseTo(3.5, 5);
  });

  it("the committed floor FALLS as the commitment rises — fixed cost spreads further", () => {
    const at2k = getCostBasis(periods, 0, loads, now, 3, [], 2000).costPerTotalMile!;
    const at3k = getCostBasis(periods, 0, loads, now, 3, [], 3000).costPerTotalMile!;
    const at6k = getCostBasis(periods, 0, loads, now, 3, [], 6000).costPerTotalMile!;
    expect(at2k).toBeCloseTo(3.5, 5); // 3000/2000 + 2
    expect(at3k).toBeCloseTo(3, 5); // 3000/3000 + 2
    expect(at6k).toBeCloseTo(2.5, 5); // 3000/6000 + 2
    expect(at2k).toBeGreaterThan(at3k);
    expect(at3k).toBeGreaterThan(at6k);
  });

  it("THE WHOLE POINT: a slow month no longer moves the floor", () => {
    // Same costs, but the truck drove a third of the miles. Under the measured
    // basis this inflates the floor; under a commitment it must not move.
    const slowLoads = months.map((m) => milesIn(m, 333));
    const committed = getCostBasis(periods, 0, loads, now, 3, [], 3000);
    const committedSlow = getCostBasis(periods, 0, slowLoads, now, 3, [], 3000);
    const measured = getCostBasis(periods, 0, loads, now, 3, [], null);
    const measuredSlow = getCostBasis(periods, 0, slowLoads, now, 3, [], null);

    // The measured basis triples when the miles collapse...
    expect(measured.costPerTotalMile).toBeCloseTo(5, 5); // 15,000 / 3,000
    expect(measuredSlow.costPerTotalMile).toBeCloseTo(15.015, 2); // 15,000 / 999
    // ...the committed fixed half does not move at all.
    expect(committed.fixedMonthly).toBeCloseTo(committedSlow.fixedMonthly!, 5);
    expect(committed.targetMiles).toBe(committedSlow.targetMiles);
  });

  it("the notes join the FIXED half — they draft whether the truck moves or not", () => {
    const withNotes = getCostBasis(periods, 1000, loads, now, 3, [], 2000);
    expect(withNotes.fixedMonthly).toBeCloseTo(4000, 5); // 3,000 + 1,000
    expect(withNotes.costPerTotalMile).toBeCloseTo(4, 5); // 4000/2000 + 2
  });

  it("falls back to the measured basis when no commitment is set", () => {
    const b = getCostBasis(periods, 0, loads, now, 3, [], null);
    expect(b.basisKind).toBe("measured");
    expect(b.targetMiles).toBeNull();
    expect(b.costPerTotalMile).toBeCloseTo(5, 5); // 15,000 cost / 3,000 miles
  });

  it("falls back when the months carry no fixed/variable split at all", () => {
    // Pre-split months (no lines) must not silently read as $0 fixed.
    const plain = months.map((m) => period(m, 0, 5000));
    const b = getCostBasis(plain, 0, loads, now, 3, [], 2000);
    expect(b.basisKind).toBe("measured");
    expect(b.fixedMonthly).toBeNull();
    expect(b.variablePerMile).toBeNull();
    expect(b.costPerTotalMile).toBeCloseTo(5, 5);
  });

  it("a month missing its split is left out of the split, not counted as zero", () => {
    // Apr and Jun carry lines; May does not. The averages must read TWO months,
    // and May's miles must not land in the variable denominator either.
    const mixed = [split("2026-04-01", 3000, 2000), period("2026-05-01", 0, 5000), split("2026-06-01", 3000, 2000)];
    const b = getCostBasis(mixed, 0, loads, now, 3, [], 2000);
    expect(b.basisKind).toBe("committed");
    expect(b.fixedMonthly).toBeCloseTo(3000, 5); // 6,000 / 2 months, not / 3
    expect(b.variablePerMile).toBeCloseTo(2, 5); // 4,000 / 2,000 miles, not / 3,000
  });

  it("refuses a zero or negative commitment rather than dividing by it", () => {
    for (const bad of [0, -1, -5000]) {
      const b = getCostBasis(periods, 0, loads, now, 3, [], bad);
      expect(b.basisKind).toBe("measured");
      expect(b.costPerTotalMile).toBeCloseTo(5, 5);
      expect(Number.isFinite(b.costPerTotalMile!)).toBe(true);
    }
  });

  it("a commitment with no miles driven still prices — that is the point", () => {
    // No loads at all: the measured basis can say nothing, but the commitment
    // still answers "what must a mile earn if I run the miles I promised?"
    // using the fixed half alone.
    const b = getCostBasis(periods, 0, [], now, 3, [], 2000);
    expect(b.totalMiles).toBe(0);
    expect(b.variablePerMile).toBeNull(); // no miles to spread variable over
    expect(b.basisKind).toBe("measured"); // so it cannot be fully derived
    expect(b.costPerTotalMile).toBeNull();
  });

  it("reproduces the real floor: $11,314 fixed + $1.59/mi over 7,500 = $3.099", () => {
    // The May–Oct 2026 window: $9,354/mo fixed operating, $1,960 of notes, and
    // $70,604 of variable over 44,404 driven miles.
    //
    // THE NOTES FIGURE IS PRINCIPAL ONLY ($1,960, obligations.amount), not the
    // full bank draft ($2,409, draft_amount). The loans' interest is already a
    // P&L expense, so adding the whole payment counts it twice — the exact
    // double-count migration 062 was written to prevent. monthlyObligationCost
    // reads `amount` for this reason and the basis must inherit it.
    const real = [
      { m: "2026-04-01", f: 9354, v: 11767 },
      { m: "2026-05-01", f: 9354, v: 11767 },
      { m: "2026-06-01", f: 9354, v: 11767 },
    ].map((x) => split(x.m, x.f, x.v));
    const realLoads = months.map((m) => milesIn(m, 7401));
    const b = getCostBasis(real, 1960, realLoads, now, 3, [], 7500);
    expect(b.fixedMonthly).toBeCloseTo(11314, 2);
    expect(b.variablePerMile).toBeCloseTo(1.59, 2);
    expect(b.costPerTotalMile).toBeCloseTo(3.099, 2);
    // ÷ the measured 0.7593 keep = a $4.08 break-even, and the minimum rung
    // (+17.7%) is $4.80 — which is exactly the 15% margin goal.
    expect(b.costPerTotalMile! / 0.7593).toBeCloseTo(4.08, 2);
    expect((b.costPerTotalMile! / 0.7593) * 1.177).toBeCloseTo(4.8, 2);
  });
});

describe("monthMiles — the trip log joins the odometer union (BASIS-07)", () => {
  const load = (n: number, start: number, end: number, loaded: number): Load =>
    ({ load_id: `l${n}`, load_number: `910000${n}`, load_status: "delivered", pickup_date: "2026-05-0" + n, delivery_date: "2026-05-0" + (n + 1), odometer_start: start, odometer_end: end, loaded_miles: loaded, linehaul: 1000, fuel_surcharge: 0, net_revenue: 730, gross_revenue: 1000 }) as unknown as Load;
  const trip = (start: number, end: number, date: string) => ({ trip_id: "t1", trip_date: date, odometer_start: start, odometer_end: end, trip_purpose: "home", trip_type: "deadhead" }) as unknown as Trip;
  const loads = [load(1, 1000, 1500, 450), load(2, 1800, 2200, 380)];

  it("a home trip between two loads adds its miles once", () => {
    expect(monthMiles(loads, 2026, 4).total).toBe(900); // 500 + 400, loads alone
    expect(monthMiles(loads, 2026, 4, [trip(1500, 1800, "2026-05-02")]).total).toBe(1200); // + the 300-mile run home
    expect(monthMiles(loads, 2026, 4, [trip(1500, 1800, "2026-05-02")]).loaded).toBe(830); // loaded miles never move
  });

  it("a trip inside a load's window, or in another month, adds nothing", () => {
    expect(monthMiles(loads, 2026, 4, [trip(1100, 1200, "2026-05-02")]).total).toBe(900);
    expect(monthMiles(loads, 2026, 4, [trip(1500, 1800, "2026-06-02")]).total).toBe(900);
    expect(monthMiles(loads, 2026, 4, [trip(1800, 1800, "2026-05-02")]).total).toBe(900); // an equal reading is no span
  });
});

describe("booking ladder (gross rate to book per mile driven)", () => {
  it("break-even = cost per total mile ÷ keep; tiers scale from there", () => {
    // Jason: $3.17 cost/total mile ÷ 0.73 keep = $4.34 gross to book
    const breakEven = 3.165 / 0.73;
    const l = getRateLadder(breakEven, { minimum: 0.15, target: 0.35, prime: 0.6 });
    expect(l.breakEven).toBeCloseTo(4.34, 2);
    expect(l.target).toBeCloseTo(4.34 * 1.35, 1);
    expect(l.prime).toBeCloseTo(4.34 * 1.6, 1);
  });
});

describe("getRateLadder", () => {
  it("marks up the break-even by each tier", () => {
    const l = getRateLadder(4, { minimum: 0.15, target: 0.35, prime: 0.6 });
    expect(l.breakEven).toBe(4);
    expect(l.minimum).toBeCloseTo(4.6, 5);
    expect(l.target).toBeCloseTo(5.4, 5);
    expect(l.prime).toBeCloseTo(6.4, 5);
  });

  it("all null when break-even is unknown", () => {
    const l = getRateLadder(null, { minimum: 0.15, target: 0.35, prime: 0.6 });
    expect(l.breakEven).toBeNull();
    expect(l.target).toBeNull();
  });
});

describe("bookedRate", () => {
  it("grosses a net rate up to the full booking rate by the linehaul take", () => {
    expect(bookedRate(5.4, 0.73)).toBeCloseTo(7.397, 2); // 5.40 / 0.73
    expect(bookedRate(4.1, 0.73)).toBeCloseTo(5.616, 2);
  });
  it("no gross-up at 100% take (own authority); null when net absent or take 0", () => {
    expect(bookedRate(5, 1)).toBe(5);
    expect(bookedRate(null, 0.73)).toBeNull();
    expect(bookedRate(5, 0)).toBeNull();
  });
});

describe("getGrossTargets", () => {
  it("weekly + daily floors and margin-goal target", () => {
    // 2nd arg is the target profit margin (profit ÷ revenue). At 20% margin the
    // target = break-even ÷ (1 − 0.20) = break-even × 1.25.
    const g = getGrossTargets(26000, 0.2, 22);
    expect(g.weeklyBreakEven).toBeCloseTo(26000 / (52 / 12), 5); // 6000
    expect(g.weeklyTarget).toBeCloseTo((26000 / (52 / 12)) / 0.8, 5);
    expect(g.dailyBreakEven).toBeCloseTo(26000 / 22, 5);
    expect(g.dailyTarget).toBeCloseTo((26000 / 22) / 0.8, 5);
  });

  it("a 0% margin target equals break-even", () => {
    const g = getGrossTargets(26000, 0, 22);
    expect(g.weeklyTarget).toBeCloseTo(g.weeklyBreakEven!, 5);
    expect(g.dailyTarget).toBeCloseTo(g.dailyBreakEven!, 5);
    expect(g.dailyTargetCalendar).toBeCloseTo(g.dailyBreakEvenCalendar!, 5);
  });

  it("null when there's no cost basis", () => {
    const g = getGrossTargets(null, 0.35, 22);
    expect(g.weeklyBreakEven).toBeNull();
    expect(g.dailyTarget).toBeNull();
    expect(g.dailyBreakEvenCalendar).toBeNull();
    expect(g.dailyTargetCalendar).toBeNull();
  });

  // A LOAD owns calendar days — the truck is under it over the weekend too —
  // so the $/day figure is judged against a calendar-day bar, not the
  // working-day one the dashboard asks "what must today earn?" with.
  it("spreads the same cost over calendar days as well as working days", () => {
    const g = getGrossTargets(26000, 0.2, 22);
    expect(g.dailyBreakEvenCalendar).toBeCloseTo(26000 / (365 / 12), 5); // ≈ 855
    expect(g.dailyTargetCalendar).toBeCloseTo((26000 / (365 / 12)) / 0.8, 5);
  });

  it("the calendar bar sits BELOW the working-day bar — 30.4 days, not 22", () => {
    const g = getGrossTargets(26000, 0.2, 22);
    expect(g.dailyBreakEvenCalendar!).toBeLessThan(g.dailyBreakEven!);
    expect(g.dailyTargetCalendar!).toBeLessThan(g.dailyTarget!);
  });

  it("the two pairs carry the same margin uplift", () => {
    const g = getGrossTargets(22000, 0.15, 22);
    expect(g.dailyTarget! / g.dailyBreakEven!).toBeCloseTo(1 / 0.85, 10);
    expect(g.dailyTargetCalendar! / g.dailyBreakEvenCalendar!).toBeCloseTo(1 / 0.85, 10);
  });
});

describe("payWeekRange", () => {
  it("runs Wednesday → the next Wednesday (Wed–Tue inclusive)", () => {
    // 2026-07-09 is a Thursday → pay week started Wed 2026-07-08
    const { start, end } = payWeekRange(new Date("2026-07-09T12:00:00Z"), 3);
    expect(start.getUTCDay()).toBe(3); // Wednesday
    expect(start.toISOString().slice(0, 10)).toBe("2026-07-08");
    expect(end.toISOString().slice(0, 10)).toBe("2026-07-15");
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    expect(days).toBe(7);
  });

  it("on the start day itself, the week starts today", () => {
    // 2026-07-08 is a Wednesday
    const { start } = payWeekRange(new Date("2026-07-08T00:00:00Z"), 3);
    expect(start.toISOString().slice(0, 10)).toBe("2026-07-08");
  });
});

describe("getWeekBookedGross", () => {
  const start = new Date("2026-07-08T00:00:00Z");
  const end = new Date("2026-07-15T00:00:00Z");

  it("sums booked + in-transit + delivered in range, excludes cancelled and out-of-range", () => {
    const loads = [
      load({ delivery_date: "2026-07-08", load_status: "delivered", linehaul: "1000" }),
      load({ delivery_date: "2026-07-10", load_status: "booked", linehaul: "2000" }),
      load({ delivery_date: "2026-07-14", load_status: "in_transit", linehaul: "3000" }),
      load({ delivery_date: "2026-07-15", load_status: "booked", linehaul: "9999" }), // end is exclusive
      load({ delivery_date: "2026-07-10", load_status: "cancelled", linehaul: "9999" }),
      load({ delivery_date: "2026-07-01", load_status: "delivered", linehaul: "9999" }), // before range
    ];
    expect(getWeekBookedGross(loads, start, end)).toBeCloseTo(6000, 5);
  });

  it("dates a not-yet-delivered load by its pickup day (the load you're under)", () => {
    const loads = [
      load({ delivery_date: "2026-07-08", load_status: "delivered", linehaul: "1000" }),
      // in-transit, no delivery_date yet, but picked up this week — must count
      load({
        delivery_date: null,
        pickup_date: "2026-07-10",
        load_status: "in_transit",
        linehaul: "5000",
      }),
    ];
    expect(getWeekBookedGross(loads, start, end)).toBeCloseTo(6000, 5); // committed sees both
    expect(getWeekEarnedGross(loads, start, end)).toBeCloseTo(1000, 5); // earned, delivered only
  });
});

describe("getWeekEarnedGross", () => {
  const start = new Date("2026-07-08T00:00:00Z");
  const end = new Date("2026-07-15T00:00:00Z");

  it("counts only DELIVERED freight in range — booked/in-transit are committed, not earned", () => {
    const loads = [
      load({ delivery_date: "2026-07-08", load_status: "delivered", linehaul: "1000" }),
      load({ delivery_date: "2026-07-10", load_status: "booked", linehaul: "2000" }), // committed, not earned
      load({ delivery_date: "2026-07-14", load_status: "in_transit", linehaul: "3000" }), // committed, not earned
      load({ delivery_date: "2026-07-01", load_status: "delivered", linehaul: "9999" }), // before range
    ];
    expect(getWeekEarnedGross(loads, start, end)).toBeCloseTo(1000, 5);
    // committed still sees all three in range
    expect(getWeekBookedGross(loads, start, end)).toBeCloseTo(6000, 5);
  });
});

describe("getWeekRpm", () => {
  const start = new Date("2026-07-08T00:00:00Z");
  const end = new Date("2026-07-15T00:00:00Z");

  it("blends this week's revenue over this week's loaded miles", () => {
    const loads = [
      load({ delivery_date: "2026-07-09", load_status: "booked", linehaul: "4000", loaded_miles: 1000 }),
      load({ delivery_date: "2026-07-11", load_status: "delivered", linehaul: "6000", loaded_miles: 1000 }),
      load({ delivery_date: "2026-07-20", load_status: "delivered", linehaul: "9999", loaded_miles: 1000 }), // out of range
    ];
    expect(getWeekRpm(loads, start, end)).toBeCloseTo(5.0, 5); // 10000 / 2000
  });

  it("null when there are no loaded miles this week", () => {
    expect(getWeekRpm([], start, end)).toBeNull();
  });
});

describe("getWindowRpm", () => {
  const now = new Date("2026-07-09T00:00:00Z");

  it("blends revenue over loaded miles for the basis window (six complete months), loads only", () => {
    const loads = [
      load({ delivery_date: "2026-04-15", linehaul: "8000", loaded_miles: 2000 }),
      load({ delivery_date: "2026-05-15", linehaul: "8000", loaded_miles: 2000 }),
      load({ delivery_date: "2026-06-15", linehaul: "8000", loaded_miles: 2000 }),
      load({ delivery_date: "2026-01-15", linehaul: "4000", loaded_miles: 2000 }), // six months back — inside the window since 2026-11-04
      load({ delivery_date: "2025-12-15", linehaul: "99999", loaded_miles: 2000 }), // seven months back — outside
      load({ delivery_date: "2026-07-15", linehaul: "9999", loaded_miles: 2000 }), // current month excluded
    ];
    expect(getWindowRpm(loads, now)).toBeCloseTo(3.5, 5); // 28000 / 8000
    expect(getWindowRpm(loads, now, 3)).toBeCloseTo(4.0, 5); // the old three-month window, asked for by name
  });

  it("null when there are no loaded miles in the window", () => {
    expect(getWindowRpm([], now)).toBeNull();
  });
});

describe("monthlyObligationCost", () => {
  const ob = (over: Partial<Obligation>): Obligation =>
    ({
      obligation_id: "o",
      label: "x",
      amount: 0,
      active: true,
      is_draw: false,
      original_balance: null,
      current_balance: null,
      balance_as_of: null,
      payoff_date: null,
      asset_type: null,
      asset_id: null,
      ...over,
    }) as Obligation;

  it("sums active debt obligations", () => {
    expect(
      monthlyObligationCost([
        ob({ amount: 1575 }),
        ob({ amount: 475.19 }),
        ob({ amount: 358 }),
      ]),
    ).toBeCloseTo(2408.19, 2);
  });

  it("excludes owner draws — a distribution is not a cost", () => {
    const cost = monthlyObligationCost([
      ob({ amount: 1575 }),
      ob({ amount: 1000, is_draw: true }), // active draw must NOT count
    ]);
    expect(cost).toBe(1575);
  });

  it("excludes inactive obligations", () => {
    expect(
      monthlyObligationCost([
        ob({ amount: 1575 }),
        ob({ amount: 900, active: false }),
      ]),
    ).toBe(1575);
  });

  it("is 0 for an empty list", () => {
    expect(monthlyObligationCost([])).toBe(0);
  });
});

describe("getBookedAheadGross", () => {
  const L = (over: Record<string, unknown>) => over as unknown as import("@/types/load").Load;
  it("counts live bookings landing after the week; Brandie's $5,220 case", () => {
    const weekEnd = new Date("2026-08-19T00:00:00Z"); // pay week ends Tue Aug 18
    const loads = [
      L({ load_status: "booked", delivery_date: "2026-08-21", linehaul: "4573", fuel_surcharge: "647", total_accessorials: 0 }),
      L({ load_status: "booked", delivery_date: "2026-08-17", linehaul: "1000", fuel_surcharge: "0", total_accessorials: 0 }), // lands THIS week → committed's job
      L({ load_status: "delivered", delivery_date: "2026-08-25", linehaul: "999", fuel_surcharge: "0", total_accessorials: 0 }), // already earned → not pipeline
    ];
    expect(getBookedAheadGross(loads, weekEnd)).toBeCloseTo(5220, 5);
  });
  it("is zero with nothing booked past the window", () => {
    expect(getBookedAheadGross([], new Date("2026-08-19T00:00:00Z"))).toBe(0);
  });
});

describe("getWeekGrossPipeline", () => {
  const L = (over: Record<string, unknown>) => over as unknown as import("@/types/load").Load;
  const start = new Date("2026-08-12T00:00:00Z");
  const end = new Date("2026-08-19T00:00:00Z");
  it("excludes delivered — one delivered load must not project double (Brandie's case)", () => {
    const loads = [
      L({ load_status: "delivered", delivery_date: "2026-08-12", linehaul: "2250", fuel_surcharge: "0", total_accessorials: 0 }),
    ];
    expect(getWeekGrossPipeline(loads, start, end)).toBe(0);
    // projected = earned + pipeline = 2250 + 0, never 4500
  });
  it("counts the undelivered slice of the week", () => {
    const loads = [
      L({ load_status: "delivered", delivery_date: "2026-08-12", linehaul: "2250", fuel_surcharge: "0", total_accessorials: 0 }),
      L({ load_status: "in_transit", delivery_date: "2026-08-17", linehaul: "3199", fuel_surcharge: "651", total_accessorials: 0 }),
      L({ load_status: "booked", delivery_date: "2026-08-25", linehaul: "999", fuel_surcharge: "0", total_accessorials: 0 }), // outside the window
    ];
    expect(getWeekGrossPipeline(loads, start, end)).toBeCloseTo(3850, 5);
  });
});
