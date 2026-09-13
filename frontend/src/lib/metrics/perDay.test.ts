import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  loadDays,
  loadPerDay,
  perDayOver,
  perDayTone,
  perDayToneWord,
  fmtPerDay,
  PER_DAY_TONE_VAR,
} from "./perDay";
import { getGrossTargets } from "./rateTargets";
import { WORKING_DAYS_PER_MONTH } from "@/lib/constants/targets";

// A delivered load with the two DATE columns the rule reads. Gross comes from
// linehaul + FSC + accessorials unless a fixture sets gross_revenue.
const load = (over: Partial<Load>): Load =>
  ({
    load_id: "l",
    load_number: "1",
    load_status: "delivered",
    pickup_date: "2026-08-03",
    delivery_date: "2026-08-04",
    linehaul: "2000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    loaded_miles: 500,
    ...over,
  }) as Load;

describe("loadDays", () => {
  it("counts pickup → delivery inclusive", () => {
    // Aug 3 → Aug 4 is two days on the truck, not one.
    expect(loadDays(load({ pickup_date: "2026-08-03", delivery_date: "2026-08-04" }))).toBe(2);
    expect(loadDays(load({ pickup_date: "2026-08-03", delivery_date: "2026-08-07" }))).toBe(5);
  });

  it("a same-day pickup and delivery is one day", () => {
    expect(loadDays(load({ pickup_date: "2026-08-03", delivery_date: "2026-08-03" }))).toBe(1);
  });

  it("reads DATE columns as day keys, not local time", () => {
    // The API hands DATE columns back as timestamps; the day is the first ten
    // characters, and a late-evening stamp must not roll into the next day.
    expect(
      loadDays(
        load({
          pickup_date: "2026-03-07T00:00:00.000Z",
          delivery_date: "2026-03-09T00:00:00.000Z",
        }),
      ),
    ).toBe(3);
  });

  it("spans a DST boundary without gaining or losing a day", () => {
    // US DST starts 2026-03-08 — local-midnight math would make this 3.x days.
    expect(loadDays(load({ pickup_date: "2026-03-07", delivery_date: "2026-03-10" }))).toBe(4);
  });

  it("is null on a reversed pair — a typo is not the best load on the book", () => {
    // Clamping to 1 would hand a delivery-before-pickup typo the smallest
    // possible denominator and so the biggest possible $/day. Bad data is
    // excluded, never flattering.
    expect(loadDays(load({ pickup_date: "2026-08-05", delivery_date: "2026-08-03" }))).toBeNull();
    expect(loadPerDay(load({ pickup_date: "2026-08-05", delivery_date: "2026-08-03" }))).toBeNull();
  });

  it("is null without a delivery date, without a pickup date, or when cancelled", () => {
    expect(loadDays(load({ delivery_date: null }))).toBeNull();
    expect(loadDays(load({ delivery_date: undefined }))).toBeNull();
    expect(loadDays(load({ pickup_date: "" as unknown as string }))).toBeNull();
    expect(loadDays(load({ load_status: "cancelled" }))).toBeNull();
  });
});

describe("loadPerDay", () => {
  it("is gross ÷ days", () => {
    // $2,300 over two days.
    const l = load({ linehaul: "2000", fuel_surcharge: "300", delivery_date: "2026-08-04" });
    expect(loadPerDay(l)).toBeCloseTo(1150, 6);
  });

  it("uses the server's gross_revenue when it has one", () => {
    const l = load({ gross_revenue: "5500", delivery_date: "2026-08-05" }); // Aug 3 → 5 = 3 days
    expect(loadPerDay(l)).toBeCloseTo(5500 / 3, 6);
  });

  it("is null when the days are unknown", () => {
    expect(loadPerDay(load({ delivery_date: null }))).toBeNull();
  });

  it("reads a BOOKED load's planned days — the load header's number", () => {
    const l = load({ load_status: "booked", gross_revenue: "3000", delivery_date: "2026-08-05" });
    expect(loadPerDay(l)).toBeCloseTo(1000, 6);
  });
});

describe("perDayOver", () => {
  it("weights by days — Σgross ÷ Σdays, never a mean of ratios", () => {
    const rows = [
      // two days, $2,300 → $1,150/day on its own
      load({ gross_revenue: "2300", pickup_date: "2026-08-03", delivery_date: "2026-08-04" }),
      // five days, $5,220 → $1,044/day on its own
      load({ gross_revenue: "5220", pickup_date: "2026-08-10", delivery_date: "2026-08-14" }),
    ];
    const out = perDayOver(rows);
    expect(out.days).toBe(7);
    expect(out.gross).toBeCloseTo(7520, 6);
    expect(out.loads).toBe(2);
    expect(out.perDay).toBeCloseTo(1074.29, 2); // NOT the $1,097 mean of the two rates
    expect(Math.round(out.perDay as number)).toBe(1074);
  });

  it("excludes a load with no delivery date", () => {
    const out = perDayOver([
      load({ gross_revenue: "2300", pickup_date: "2026-08-03", delivery_date: "2026-08-04" }),
      load({ gross_revenue: "9999", delivery_date: null }),
    ]);
    expect(out.loads).toBe(1);
    expect(out.days).toBe(2);
    expect(out.perDay).toBeCloseTo(1150, 6);
  });

  it("excludes cancelled loads", () => {
    const out = perDayOver([
      load({ gross_revenue: "2300", pickup_date: "2026-08-03", delivery_date: "2026-08-04" }),
      load({ gross_revenue: "9999", load_status: "cancelled" }),
    ]);
    expect(out.loads).toBe(1);
    expect(out.perDay).toBeCloseTo(1150, 6);
  });

  it("excludes loads that have not delivered — booked and in transit never roll up", () => {
    const out = perDayOver([
      load({ gross_revenue: "3000", load_status: "booked" }),
      load({ gross_revenue: "3000", load_status: "in_transit" }),
    ]);
    expect(out).toEqual({ perDay: null, days: 0, gross: 0, loads: 0 });
  });

  it("skips a delivered load with no gross — it neither adds days nor dilutes", () => {
    // $0 (or a negative, or an unparseable) gross on a DELIVERED load is
    // missing data, not free freight. Counting its days would drag the rate
    // down; counting it at all would claim we know what it paid.
    const good = load({ gross_revenue: "2300", pickup_date: "2026-08-03", delivery_date: "2026-08-04" });
    const out = perDayOver([
      good,
      load({ gross_revenue: "0", pickup_date: "2026-08-10", delivery_date: "2026-08-14" }),
      load({ gross_revenue: "-500", pickup_date: "2026-08-17", delivery_date: "2026-08-18" }),
      // Unparseable all the way down — no gross_revenue to read and a
      // linehaul that isn't a number, so loadGross has nothing to fall back on.
      load({ linehaul: "not a number", pickup_date: "2026-08-20", delivery_date: "2026-08-21" }),
    ]);
    expect(out.loads).toBe(1);
    expect(out.days).toBe(2); // the $0 load's five days never joined the denominator
    expect(out.gross).toBeCloseTo(2300, 6);
    expect(out.perDay).toBeCloseTo(1150, 6); // identical to the one-load answer
  });

  it("excludes a reversed-date load from the roll-up entirely", () => {
    const out = perDayOver([
      load({ gross_revenue: "2300", pickup_date: "2026-08-03", delivery_date: "2026-08-04" }),
      load({ gross_revenue: "9000", pickup_date: "2026-08-14", delivery_date: "2026-08-10" }),
    ]);
    expect(out.loads).toBe(1);
    expect(out.days).toBe(2);
    expect(out.perDay).toBeCloseTo(1150, 6); // not the $5,650/day the typo would have bought
  });

  it("is null on an empty set, never $0", () => {
    expect(perDayOver([])).toEqual({ perDay: null, days: 0, gross: 0, loads: 0 });
  });

  it("is null when every load is missing its dates", () => {
    const out = perDayOver([load({ delivery_date: null }), load({ delivery_date: undefined })]);
    expect(out.perDay).toBeNull();
    expect(out.days).toBe(0);
  });

  it("the sheet's real load — 5597013, $5,500 over 3 days, is $1,833/day", () => {
    const l = load({
      load_number: "5597013",
      gross_revenue: "5500",
      pickup_date: "2026-08-26",
      delivery_date: "2026-08-28",
    });
    expect(loadDays(l)).toBe(3);
    expect(fmtPerDay(loadPerDay(l))).toBe("$1,833");
    expect(fmtPerDay(perDayOver([l]).perDay)).toBe("$1,833");
  });
});

describe("perDayTone", () => {
  const targets = { dailyBreakEvenCalendar: 1000, dailyTargetCalendar: 1350 };

  it("is good at and above the daily target", () => {
    expect(perDayTone(1350, targets)).toBe("good");
    expect(perDayTone(1360, targets)).toBe("good");
  });

  it("is warn at break-even and up to just under the target", () => {
    expect(perDayTone(1000, targets)).toBe("warn");
    expect(perDayTone(1349.99, targets)).toBe("warn");
  });

  it("is bad below break-even", () => {
    expect(perDayTone(999.99, targets)).toBe("bad");
    expect(perDayTone(0, targets)).toBe("bad");
  });

  it("is null without a figure or without targets", () => {
    expect(perDayTone(null, targets)).toBeNull();
    expect(perDayTone(undefined, targets)).toBeNull();
    expect(perDayTone(1500, null)).toBeNull();
    expect(perDayTone(1500, undefined)).toBeNull();
    expect(perDayTone(1500, { dailyBreakEvenCalendar: null, dailyTargetCalendar: null })).toBeNull();
    expect(perDayTone(1500, { dailyBreakEvenCalendar: 1000, dailyTargetCalendar: null })).toBeNull();
    expect(perDayTone(1500, { dailyBreakEvenCalendar: null, dailyTargetCalendar: 1350 })).toBeNull();
  });

  // THE reason the bar is per calendar day. 2026-08-07 is a Friday: a Fri→Mon
  // run owns four calendar days, two of them a weekend. At $3,600 it pays
  // $900 a day. Against a WORKING-day bar (cost ÷ 22 = $1,000 break-even) that
  // load reads "under break-even" — red — purely for spanning a weekend it had
  // no say in. Against the calendar bar it is honestly judged.
  it("does not call a fair Fri→Mon run bad for owning a weekend", () => {
    const l = load({
      gross_revenue: "3600",
      pickup_date: "2026-08-07", // Friday
      delivery_date: "2026-08-10", // Monday
    });
    expect(loadDays(l)).toBe(4);
    expect(loadPerDay(l)).toBeCloseTo(900, 6);

    const g = getGrossTargets(22000, 0.15, WORKING_DAYS_PER_MONTH);
    // The bar the figure is actually judged against.
    expect(g.dailyBreakEvenCalendar).toBeCloseTo(22000 / (365 / 12), 5); // ≈ 723
    expect(g.dailyTargetCalendar).toBeCloseTo((22000 / (365 / 12)) / 0.85, 5); // ≈ 851
    expect(perDayTone(loadPerDay(l), g)).not.toBe("bad");
    expect(perDayTone(loadPerDay(l), g)).toBe("good");

    // …and the bar it must NOT be judged against, spelled out so the day this
    // ever gets rewired back to working days, this test says why not.
    expect(g.dailyBreakEven).toBeCloseTo(1000, 5);
    expect(
      perDayTone(loadPerDay(l), {
        dailyBreakEvenCalendar: g.dailyBreakEven,
        dailyTargetCalendar: g.dailyTarget,
      }),
    ).toBe("bad");
  });

  it("says the tone in the one vocabulary every surface uses", () => {
    expect(perDayToneWord(perDayTone(1360, targets))).toBe("above target");
    expect(perDayToneWord(perDayTone(1100, targets))).toBe("near target");
    expect(perDayToneWord(perDayTone(500, targets))).toBe("under break-even");
    expect(perDayToneWord(null)).toBeNull();
  });
});

describe("fmtPerDay", () => {
  it("is whole dollars with a thousands separator", () => {
    expect(fmtPerDay(1360)).toBe("$1,360");
    expect(fmtPerDay(1833.33)).toBe("$1,833");
    expect(fmtPerDay(1074.2857)).toBe("$1,074");
  });

  it("draws an em dash for no figure — never $0", () => {
    expect(fmtPerDay(null)).toBe("—");
    expect(fmtPerDay(undefined)).toBe("—");
  });
});

// One colour rule: every surface that paints a $/day reads this list — the
// load header drops the value straight into a style, rpmStyle turns the same
// token into the Tailwind utility the tables wear.
describe("PER_DAY_TONE_VAR", () => {
  it("names a theme token for each of the three tones, and only those", () => {
    expect(PER_DAY_TONE_VAR.good).toBe("var(--color-status-positive-text)");
    expect(PER_DAY_TONE_VAR.warn).toBe("var(--color-status-aware-text)");
    expect(PER_DAY_TONE_VAR.bad).toBe("var(--color-status-negative-text)");
    expect(Object.keys(PER_DAY_TONE_VAR).sort()).toEqual(["bad", "good", "warn"]);
  });
});
