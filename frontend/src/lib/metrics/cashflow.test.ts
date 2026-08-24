import { describe, it, expect } from "vitest";
import {
  nextDraftDate,
  expectedPayDate,
  twoWeekLiquidity,
  buildForecast,
  pretaxMargin,
  type FinancialMonth,
  type CashAssumptions,
} from "./cashflow";
import type { Obligation } from "@/types/obligation";
import type { Load } from "@/types/load";

const bill = (
  label: string,
  category: "loan_lease" | "insurance" | "other",
  amount: number,
  day: number,
  extra: Partial<Obligation> = {},
): Obligation =>
  ({
    label, category, amount, day_of_month: day, active: true,
    draft_amount: null, on_pl: true, is_draw: false,
    ...extra,
  }) as unknown as Obligation;

// Jason's real bill list (DTS-FINANCIALS.xlsx, Recurring Bills sheet). The
// loans carry a break-even (principal) `amount` and a FULL `draft_amount` —
// liquidity must draft the full payment.
const BILLS: Obligation[] = [
  bill("Truck Note", "loan_lease", 1575.0, 26, { draft_amount: 1575.0, on_pl: false }),
  bill("Trailer Payment", "loan_lease", 230.0, 27, { draft_amount: 475.19, on_pl: false }),
  bill("Best Egg", "loan_lease", 155.0, 19, { draft_amount: 358.97, on_pl: false }),
  bill("Health Ins", "insurance", 380.45, 4),
  bill("Dental Ins", "insurance", 30.44, 20),
  bill("Guarantee fee", "other", 900.0, 27),
  bill("Phone", "other", 341.0, 29),
  bill("Prepass", "other", 200.0, 4),
  bill("Internet", "other", 130.0, 18),
  bill("Intuit", "other", 119.23, 6),
  bill("Claude", "other", 100.0, 7),
  bill("Accounting", "other", 75.0, 15),
  bill("Parking", "other", 75.0, 18),
  bill("Hostinger", "other", 24.99, 17),
  bill("Analysis Ch", "other", 20.0, 9),
  bill("Canva", "other", 20.0, 7),
  bill("Railway", "other", 20.0, 14),
  bill("Google", "other", 16.8, 2),
];

describe("nextDraftDate", () => {
  it("this month when the day is still ahead (or today), next month when passed", () => {
    expect(nextDraftDate(26, "2026-08-24")).toBe("2026-08-26");
    expect(nextDraftDate(24, "2026-08-24")).toBe("2026-08-24"); // on-or-after
    expect(nextDraftDate(2, "2026-08-24")).toBe("2026-09-02"); // wrapped
  });

  it("clamps a day the month doesn't have to the month's last day", () => {
    expect(nextDraftDate(31, "2026-09-15")).toBe("2026-09-30");
    expect(nextDraftDate(30, "2026-02-10")).toBe("2026-02-28"); // non-leap
  });
});

describe("expectedPayDate — strictly after delivery", () => {
  const WED = 3;
  it("delivered Tuesday pays Wednesday's settlement (Jason's 99% rule)", () => {
    expect(expectedPayDate("2026-08-25", WED)).toBe("2026-08-26");
  });
  it("delivered ON settlement day pays the NEXT one — paperwork can't clear same-day", () => {
    expect(expectedPayDate("2026-08-26", WED)).toBe("2026-09-02");
  });
});

describe("twoWeekLiquidity — Jason's 2-Week Cash sheet, penny-exact", () => {
  // His worksheet: as-of Mon 2026-08-24, beginning $14,000, manual settlement
  // overrides ($1,000 / $0). Endings $9,800.81 and $7,176.33.
  const base = {
    asOfKey: "2026-08-24",
    beginning: 14000,
    obligations: BILLS,
    weeklyPayroll: 1908,
    loads: [] as Load[],
    settlementDay: 3,
    weeklyRevenueFallback: 4647,
  };

  it("reproduces his worksheet with the overrides", () => {
    const r = twoWeekLiquidity({ ...base, overrides: [1000, 0] });
    const [w1, w2] = r.weeks;
    expect(w1.loanLease).toBeCloseTo(2050.19, 2); // truck 26th + trailer 27th (FULL drafts)
    expect(w1.insurance).toBe(0);
    expect(w1.other).toBeCloseTo(1241.0, 2); // guarantee 27th + phone 29th
    expect(w1.ending).toBeCloseTo(9800.81, 2);
    expect(w2.beginning).toBeCloseTo(9800.81, 2);
    expect(w2.insurance).toBeCloseTo(380.45, 2); // health 9/4
    expect(w2.other).toBeCloseTo(336.03, 2); // google 2 + prepass 4 + intuit 6
    expect(w2.ending).toBeCloseTo(7176.33, 2);
    expect(r.lowestEnding).toBeCloseTo(7176.33, 2);
    expect(w1.settlementSource).toBe("override");
  });

  it("falls back to weekly revenue when no loads project into a week", () => {
    const r = twoWeekLiquidity(base);
    expect(r.weeks[0].settlements).toBe(4647);
    expect(r.weeks[0].settlementSource).toBe("fallback");
  });

  it("prefers REAL projected loads: delivered-unpaid lands on its Wednesday", () => {
    const loads = [
      // Delivered Mon 8/24, unpaid → pays Wed 8/26 (week 1). net_revenue is
      // the server-computed NET — loadRevenue prefers it over gross.
      { load_status: "delivered", payment_status: "invoiced", delivery_date: "2026-08-24", linehaul: "3000", net_revenue: "2190" },
      // Booked, delivers Tue 9/1 → pays Wed 9/2 (week 2).
      { load_status: "booked", payment_status: "unpaid", delivery_date: "2026-09-01", linehaul: "2000", net_revenue: "1460" },
      // Already PAID — its money is in the bank, not in the pipeline.
      { load_status: "delivered", payment_status: "paid", delivery_date: "2026-08-24", linehaul: "9999", net_revenue: "7299" },
    ] as unknown as Load[];
    const r = twoWeekLiquidity({ ...base, loads });
    expect(r.weeks[0].settlementSource).toBe("loads");
    expect(r.weeks[0].settlementLoads).toBe(1);
    expect(r.weeks[1].settlementLoads).toBe(1);
    expect(r.weeks[0].settlements).toBeCloseTo(2190, 2); // NET, not gross
    expect(r.weeks[1].settlements).toBeCloseTo(1460, 2);
  });

  it("inactive bills and bills without a draft day stay off the calendar", () => {
    const r = twoWeekLiquidity({
      ...base,
      obligations: [
        bill("Dead", "other", 500, 26, { active: false }),
        { label: "Draw", category: "other", amount: 1000, day_of_month: null, active: true } as unknown as Obligation,
      ],
    });
    expect(r.weeks[0].loanLease + r.weeks[0].insurance + r.weeks[0].other).toBe(0);
  });
});

// Jason's Cash Flow sheet — the forecast ground truth. Actuals Feb–Jul 2026,
// forecast Aug 2026 → Jan 2027, Nov takes 1 week home (baby).
const ACTUALS: FinancialMonth[] = [
  { month: "2026-02-01", total_income: "16557.50", net_income: "3877.80", ending_cash: "3872.39" },
  { month: "2026-03-01", total_income: "25011.52", net_income: "4028.87", ending_cash: "6732.94" },
  { month: "2026-04-01", total_income: "22698.78", net_income: "1660.09", ending_cash: "11778.30" },
  { month: "2026-05-01", total_income: "28833.36", net_income: "8218.66", ending_cash: "11028.94" },
  { month: "2026-06-01", total_income: "27745.72", net_income: "2896.27", ending_cash: "16903.61" },
  { month: "2026-07-01", total_income: "33552.45", net_income: "9337.69", ending_cash: "24355.32" },
];
const ASSUMPTIONS: CashAssumptions = {
  weekly_revenue: "4647", weekly_payroll: "1908",
  monthly_depreciation: "1804.61", fed_tax_rate: "0.15", state_tax_rate: "0.05",
  financing_floor: "-2318", tax_catchup_owed: "10000",
};

describe("buildForecast — Jason's Cash Flow sheet, penny-exact", () => {
  const fc = buildForecast(ACTUALS, ASSUMPTIONS, new Map([["2026-11-01", 1]]))!;

  it("baseline = average net income of the last 6 actuals", () => {
    expect(fc.baseline).toBeCloseTo(5003.23, 2);
  });

  it("a normal month: his Aug column", () => {
    const aug = fc.months[0];
    expect(aug.month).toBe("2026-08-01");
    expect(aug.beginning).toBeCloseTo(24355.32, 2);
    expect(aug.incomeTax).toBeCloseTo(-1000.65, 2);
    expect(aug.cashFromOps).toBeCloseTo(6807.84, 2);
    expect(aug.netChange).toBeCloseTo(3489.19, 2);
    expect(aug.ending).toBeCloseTo(27844.51, 2);
  });

  it("the home-time month: November loses a week of revenue", () => {
    const nov = fc.months[3];
    expect(nov.month).toBe("2026-11-01");
    expect(nov.weeksOff).toBe(1);
    expect(nov.netIncome).toBeCloseTo(356.23, 2);
    expect(nov.incomeTax).toBeCloseTo(-71.25, 2);
    expect(nov.netChange).toBeCloseTo(-228.41, 2);
    expect(nov.ending).toBeCloseTo(34594.5, 2);
  });

  it("the chain runs to his Jan 2027 ending", () => {
    expect(fc.months[5].ending).toBeCloseTo(41572.88, 2);
  });

  it("returns null with no actuals; averages what exists under 6", () => {
    expect(buildForecast([], ASSUMPTIONS, new Map())).toBeNull();
    const two = buildForecast(ACTUALS.slice(0, 2), ASSUMPTIONS, new Map())!;
    expect(two.baseline).toBeCloseTo((3877.8 + 4028.87) / 2, 2);
  });
});

describe("pretaxMargin — real margin now that depreciation is in the P&L", () => {
  it("net income ÷ total income; null when no income", () => {
    expect(pretaxMargin(ACTUALS[5])!).toBeCloseTo(9337.69 / 33552.45, 6);
    expect(pretaxMargin({ month: "2026-01-01", total_income: "0", net_income: "0", ending_cash: "0" })).toBeNull();
  });
});
