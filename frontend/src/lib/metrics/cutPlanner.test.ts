import { describe, it, expect } from "vitest";
import {
  classifyCutTier,
  resolveCutTier,
  buildCutPlan,
  toCutCategories,
  consolidateLevers,
  type CutCategory,
} from "./cutPlanner";

describe("classifyCutTier — Jason's real QuickBooks categories", () => {
  const cases: [string, string][] = [
    ["Insurance", "off_limits"],
    ["Interest Expense - Trailer Loan", "off_limits"],
    ["Loan Guarantor Fee - Deborah Delgado", "off_limits"],
    ["PrePass & Tolls", "off_limits"],
    ["Taxes paid", "off_limits"],
    ["Trailer Plates", "off_limits"],
    ["Permits - Truck", "off_limits"],
    ["EOBR Airtime", "off_limits"],
    ["NTP Warranty", "off_limits"], // Jason: fixed contract, can't touch
    ["Max Weight", "off_limits"],
    ["Utilities", "essential"],
    ["Legal & accounting services", "essential"],
    ["Commissions & fees", "essential"],
    ["Fuel", "efficiency"],
    ["Repairs & maintenance", "deferrable"],
    ["Payroll expenses", "last_resort"],
    ["Employee benefits", "last_resort"],
    ["Supplies", "discretionary"],
    ["Office expenses", "discretionary"],
    ["General business expenses", "discretionary"],
    ["Travel", "discretionary"],
    ["Rental Expense - Computer", "discretionary"],
  ];
  for (const [cat, tier] of cases) {
    it(`${cat} → ${tier}`, () => {
      expect(classifyCutTier(cat)).toBe(tier);
    });
  }
});

describe("classifyCutTier — no over-match on lookalike names", () => {
  const cases: [string, string][] = [
    ["Taxi", "discretionary"], // not 'tax' → off_limits
    ["Template printing", "discretionary"], // not 'plate'
    ["Sewage disposal", "discretionary"], // not 'wage' → last_resort
    ["Release fee", "discretionary"], // not 'lease'
  ];
  for (const [cat, tier] of cases) {
    it(`${cat} → ${tier}`, () => {
      expect(classifyCutTier(cat)).toBe(tier);
    });
  }
});

describe("resolveCutTier", () => {
  it("uses the manual override when present", () => {
    expect(resolveCutTier("Supplies", "off_limits")).toBe("off_limits");
  });
  it("falls back to auto-classification when no override", () => {
    expect(resolveCutTier("Supplies", null)).toBe("discretionary");
    expect(resolveCutTier("Supplies")).toBe("discretionary");
  });
});

// A representative slice of Jason's book (~monthly).
const BOOK: CutCategory[] = [
  { category: "Insurance", current: 785, baseline: 785, tier: "off_limits" },
  { category: "Repairs & maintenance", current: 1952, baseline: 1952, tier: "deferrable" },
  { category: "Fuel", current: 5509, baseline: 5509, tier: "efficiency" },
  { category: "Utilities", current: 543, baseline: 433, tier: "essential" }, // $110 over
  { category: "Supplies", current: 352, baseline: 352, tier: "discretionary" },
  { category: "Office expenses", current: 280, baseline: 280, tier: "discretionary" },
  { category: "Payroll expenses", current: 6000, baseline: 6000, tier: "last_resort" },
];

describe("buildCutPlan — ordering & balance", () => {
  it("takes overspend first, then discretionary, before deferrable/efficiency/pay", () => {
    const plan = buildCutPlan(BOOK, 500);
    expect(plan.reachesGap).toBe(true);
    // First lever is the utilities overspend ($110), then discretionary trims.
    expect(plan.levers[0].kind).toBe("overspend");
    expect(plan.levers[0].category).toBe("Utilities");
    // The gap (500) is small — it should never reach payroll or off-limits.
    expect(plan.lastResortUsed).toBe(false);
    expect(plan.levers.some((l) => l.category === "Payroll expenses")).toBe(false);
    expect(plan.levers.some((l) => l.category === "Insurance")).toBe(false);
    expect(plan.planTotal).toBeCloseTo(500, 0);
  });

  it("never lists an off-limits category and always reports them", () => {
    const plan = buildCutPlan(BOOK, 500);
    expect(plan.offLimits).toContain("Insurance");
    expect(plan.levers.every((l) => l.tier !== "off_limits")).toBe(true);
  });

  it("reaches into deferrable/efficiency before pay for a bigger gap", () => {
    const plan = buildCutPlan(BOOK, 1500);
    expect(plan.reachesGap).toBe(true);
    expect(plan.lastResortUsed).toBe(false);
    const tiers = plan.levers.map((l) => l.tier);
    // discretionary levers come before deferrable, which comes before efficiency.
    const firstDeferrable = tiers.indexOf("deferrable");
    const lastDiscretionary = tiers.lastIndexOf("discretionary");
    if (firstDeferrable >= 0 && lastDiscretionary >= 0)
      expect(lastDiscretionary).toBeLessThan(firstDeferrable);
  });

  it("uses your pay only as a last resort, and flags it", () => {
    const plan = buildCutPlan(BOOK, 4000); // more than the painless pool
    expect(plan.lastResortUsed).toBe(true);
    const payLever = plan.levers.find((l) => l.category === "Payroll expenses");
    expect(payLever?.kind).toBe("last_resort");
    // pay is last in the list
    expect(plan.levers[plan.levers.length - 1].category).toBe("Payroll expenses");
  });

  it("at last resort, pulls a pay spike back (overspend + base slice), not just the base", () => {
    const cats: CutCategory[] = [
      { category: "Payroll expenses", current: 9554, baseline: 4839, tier: "last_resort" },
    ];
    // avail = (9554−4839) + 4839*0.5 ≈ 7135, so a $6k gap is reachable from pay alone.
    const plan = buildCutPlan(cats, 6000);
    expect(plan.reachesGap).toBe(true);
    expect(plan.planTotal).toBeCloseTo(6000, 0);
  });

  it("is honest when the gap can't be closed even with everything", () => {
    const plan = buildCutPlan(BOOK, 100000);
    expect(plan.reachesGap).toBe(false);
    expect(plan.shortfall).toBeGreaterThan(0);
  });

  it("stops exactly at the gap — the running total never overshoots", () => {
    const plan = buildCutPlan(BOOK, 300);
    expect(plan.planTotal).toBeCloseTo(300, 0);
  });
});

describe("toCutCategories", () => {
  it("resolves each row's tier, override winning over auto", () => {
    const cats = toCutCategories([
      { category: "Fuel", current: 5000, baseline: 5000 },
      { category: "Supplies", current: 300, baseline: 300, cuttability: "off_limits" },
    ]);
    expect(cats[0].tier).toBe("efficiency"); // auto
    expect(cats[1].tier).toBe("off_limits"); // override beats auto (discretionary)
  });
});

describe("consolidateLevers", () => {
  it("merges a category's overspend + trim into one line, preserving order", () => {
    // Utilities overspend, then General business overspend + base trim.
    const cats: CutCategory[] = [
      { category: "Utilities", current: 543, baseline: 433, tier: "essential" },
      { category: "General business expenses", current: 297, baseline: 274, tier: "discretionary" },
    ];
    const plan = buildCutPlan(cats, 400);
    const lines = consolidateLevers(plan.levers);
    const gb = lines.find((l) => l.category === "General business expenses")!;
    // two levers (overspend $23 + trim) collapse to one line
    expect(plan.levers.filter((l) => l.category === "General business expenses").length).toBeGreaterThan(1);
    expect(lines.filter((l) => l.category === "General business expenses").length).toBe(1);
    expect(gb.reason).toMatch(/overspend \+ pare/i);
    expect(gb.amount).toBeGreaterThan(23);
  });
});
