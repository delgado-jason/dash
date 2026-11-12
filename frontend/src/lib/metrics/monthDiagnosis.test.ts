import { describe, it, expect } from "vitest";
import type { ExpensePeriod } from "@/types/expense";
import {
  whyThisMonth,
  categoryOutliers,
  type CategoryMonth,
} from "./monthDiagnosis";

const period = (month: string, inc: number | null, cogs: number | null, exp: number | null): ExpensePeriod => ({
  period_id: month,
  period_month: month,
  period_label: month,
  income_total: inc,
  cogs_total: cogs,
  expense_total: exp,
});

// Jason's real 2026, income / cogs / expenses.
const REAL: ExpensePeriod[] = [
  period("2026-01-01", 14013.22, 2028.37, 8454.88),
  period("2026-02-01", 16557.5, 4184.12, 6690.99),
  period("2026-03-01", 25011.52, 6596.12, 12581.93),
  period("2026-04-01", 22698.78, 6896.44, 12337.67),
  period("2026-05-01", 28833.36, 5776.47, 13258.66),
  period("2026-06-01", 27814.7, 4127.62, 18175.65),
  period("2026-07-01", 33741.35, 5470.69, 13786.79),
  period("2026-08-01", 22695.06, 4901.78, 19224.34),
  period("2026-09-01", 35089.25, 8607.19, 14494.05),
  period("2026-10-01", 16565.9, 3283.52, 15621.64),
];

describe("whyThisMonth", () => {
  it("THE TWO LEVERS SUM EXACTLY to the month's shortfall", () => {
    // The whole reason there are two bars and not three.
    for (const m of REAL) {
      const w = whyThisMonth(REAL, m.period_month)!;
      expect(w.revenueEffect + w.costEffect).toBeCloseTo(w.shortfall, 6);
    }
  });

  it("calls October a REVENUE month — the freight did not come", () => {
    const w = whyThisMonth(REAL, "2026-10-01")!;
    expect(w.profit).toBeCloseTo(-2339.26, 2);
    expect(w.verdict).toBe("revenue");
    // Revenue carried the shortfall; cost was close to ordinary.
    expect(w.revenueEffect).toBeLessThan(-7000);
    expect(Math.abs(w.costEffect)).toBeLessThan(1500);
  });

  it("calls August a COST month — the freight was nearly fine", () => {
    const w = whyThisMonth(REAL, "2026-08-01")!;
    expect(w.profit).toBeCloseTo(-1431.06, 2);
    expect(w.verdict).toBe("cost");
    expect(w.costEffect).toBeLessThan(-4000);
    expect(Math.abs(w.revenueEffect)).toBeLessThan(3000);
  });

  it("the two losing months get OPPOSITE verdicts — the point of the panel", () => {
    expect(whyThisMonth(REAL, "2026-10-01")!.verdict).not.toBe(
      whyThisMonth(REAL, "2026-08-01")!.verdict,
    );
  });

  it("excludes the month from its own baseline", () => {
    // With October in its own average the shortfall would shrink; excluded,
    // the usual profit is the mean of the other nine.
    const w = whyThisMonth(REAL, "2026-10-01")!;
    expect(w.comparedWith).toBe(9);
    const others = REAL.filter((p) => p.period_month !== "2026-10-01");
    const mean = others.reduce((s, p) => s + (p.income_total! - p.cogs_total! - p.expense_total!), 0) / 9;
    expect(w.usualProfit).toBeCloseTo(mean, 6);
  });

  it("says 'balanced' when neither lever dominates, rather than naming a winner by a hair", () => {
    const even = [
      period("2026-01-01", 10000, 0, 5000),
      period("2026-02-01", 10000, 0, 5000),
      period("2026-03-01", 9000, 0, 6000), // −1,000 revenue, −1,000 cost
    ];
    expect(whyThisMonth(even, "2026-03-01")!.verdict).toBe("balanced");
  });

  it("refuses when there is nothing to compare against", () => {
    expect(whyThisMonth([REAL[0]], "2026-01-01")).toBeNull();
    expect(whyThisMonth(REAL, "2026-12-01")).toBeNull(); // not a filed month
  });

  it("ignores months saved without their totals — a null is not a zero", () => {
    const broken = [...REAL, period("2026-11-01", null, null, null)];
    const w = whyThisMonth(broken, "2026-10-01")!;
    expect(w.comparedWith).toBe(9); // the broken month contributes nothing
  });
});

describe("categoryOutliers", () => {
  const MONTHS = REAL.map((p) => p.period_month);
  /** A category at `base` every month, spiking to `spike` in August. */
  const series = (category: string, base: number[], section = "expenses"): CategoryMonth[] =>
    MONTHS.map((m, i) => ({ category, section, period_month: m, amount: base[i] }));

  // Office expenses: quiet, then $2,879 in August. R&M: always lumpy.
  const office = series("Office expenses", [543, 400, 350, 420, 380, 410, 500, 2879, 450, 400]);
  const rm = series("Repairs & maintenance", [2495, 1200, 3100, 432, 2800, 1500, 2200, 3973, 4990, 900]);

  it("flags the quiet category that spiked, and NOT the lumpy one", () => {
    const out = categoryOutliers([...office, ...rm], "2026-08-01");
    expect(out.map((o) => o.category)).toEqual(["Office expenses"]);
    const o = out[0];
    expect(o.amount).toBe(2879);
    expect(o.over).toBeGreaterThan(2400);
    expect(o.sigma!).toBeGreaterThan(2);
  });

  it("R&M IS over its average — it is simply within its own swing", () => {
    // Proving the filter is about spread, not about hiding the number.
    const all = categoryOutliers([...rm], "2026-08-01", 300, 0);
    expect(all).toHaveLength(1);
    expect(all[0].over).toBeGreaterThan(1500); // over the mean...
    expect(all[0].sigma!).toBeLessThan(1.8); // ...but ordinary for R&M
  });

  it("ranks by surprise, not by dollars", () => {
    const out = categoryOutliers([...office, ...rm], "2026-08-01", 300, 0);
    // R&M's $1,800 is bigger than nothing, but office is the surprise.
    expect(out[0].category).toBe("Office expenses");
  });

  it("A MONTH WITH NO LINE ITEMS IS NOT A ZERO MONTH", () => {
    // Found by running it on dev, where six months carry P&L TOTALS but only
    // three carry line items. Counting the line-less months as $0 made Fuel —
    // present in every month that has lines — read "usual $0, never varied
    // before". A month with no lines says nothing about categories; it must
    // sit out entirely rather than halve every average.
    const threeMonths = ["2026-05-01", "2026-06-01", "2026-10-01"];
    const fuel: CategoryMonth[] = threeMonths.map((m) => ({
      category: "Fuel",
      section: "cogs",
      period_month: m,
      amount: 3200,
    }));
    // Fuel is flat across every month it appears in, so nothing is unusual.
    expect(categoryOutliers(fuel, "2026-10-01")).toHaveLength(0);

    // And its baseline is the two other months with lines, not nine.
    const spiked = fuel.map((r) =>
      r.period_month === "2026-10-01" ? { ...r, amount: 9000 } : r,
    );
    const [o] = categoryOutliers(spiked, "2026-10-01");
    expect(o.months).toBe(2);
    expect(o.usual).toBe(3200);
  });

  it("within the months that DO have lines, an absent category is a real $0", () => {
    // The other half of the same rule: Legal appears once across ten months
    // of line data, so the nine it is missing from are genuine zeros.
    const once: CategoryMonth[] = [
      { category: "Legal", section: "expenses", period_month: "2026-08-01", amount: 3000 },
      // Another category establishes that all ten months carry line data.
      ...MONTHS.map((m) => ({
        category: "Fuel",
        section: "cogs",
        period_month: m,
        amount: 3000,
      })),
    ];
    const [o] = categoryOutliers(once, "2026-08-01");
    expect(o.category).toBe("Legal");
    expect(o.usual).toBe(0);
    expect(o.months).toBe(9);
  });

  it("ignores a category that fell — this answers what RAN OVER", () => {
    const fell = series("Fuel", [5000, 5000, 5000, 5000, 5000, 5000, 5000, 1000, 5000, 5000], "cogs");
    expect(categoryOutliers(fell, "2026-08-01")).toHaveLength(0);
  });

  it("a category that never varied has no sigma — judge it on the dollars", () => {
    const flat = series("EOBR Airtime", [27, 27, 27, 27, 27, 27, 27, 1027, 27, 27]);
    const [o] = categoryOutliers(flat, "2026-08-01");
    expect(o.sigma).toBeNull();
    expect(o.over).toBe(1000);
  });

  it("skips small dollars however surprising, and needs a real baseline", () => {
    const tiny = series("Scales", [15, 15, 15, 15, 15, 15, 15, 120, 15, 15]);
    expect(categoryOutliers(tiny, "2026-08-01")).toHaveLength(0); // under $300
    expect(categoryOutliers(office.filter(r => ["2026-08-01","2026-09-01"].includes(r.period_month)), "2026-08-01")).toHaveLength(0);
    expect(categoryOutliers(office, "2026-12-01")).toHaveLength(0); // unfiled month
  });
});
