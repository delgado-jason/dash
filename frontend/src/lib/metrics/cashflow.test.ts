import { describe, it, expect } from "vitest";
import {
  nextDraftDate,
  expectedPayDate,
  buildForecast,
  archiveGaps,
  pretaxMargin,
  qboPretaxMargin,
  type FinancialMonth,
  type CashAssumptions,
} from "./cashflow";

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

// 2026-11-04: the forecast runs on net per RUNNING week (the audit found home
// time counted twice and a tax refund booked on loss months). With no home
// weeks in the baseline the figures match Jason's original sheet exactly.
const W = 52 / 12;
describe("buildForecast — net per running week, home weeks taken out once", () => {
  const fc = buildForecast(ACTUALS, ASSUMPTIONS, new Map([["2026-11-01", 1]]))!;
  const weekly = (3877.8 + 4028.87 + 1660.09 + 8218.66 + 2896.27 + 9337.69) / (6 * W);

  it("baseline = a full running month: Σ net ÷ running weeks × weeks per month — his $5,003.23 when no month held home time", () => {
    expect(fc.weeklyNet).toBeCloseTo(weekly, 2);
    expect(fc.runningWeeks).toBeCloseTo(6 * W, 4);
    expect(fc.baseline).toBeCloseTo(5003.23, 2);
    expect(fc.baselineMonths).toEqual(["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"]);
  });

  it("a normal month: his Aug column, unchanged", () => {
    const aug = fc.months[0];
    expect(aug.month).toBe("2026-08-01");
    expect(aug.beginning).toBeCloseTo(24355.32, 2);
    expect(aug.incomeTax).toBeCloseTo(-1000.65, 2);
    expect(aug.cashFromOps).toBeCloseTo(6807.84, 2);
    expect(aug.netChange).toBeCloseTo(3489.19, 2);
    expect(aug.ending).toBeCloseTo(27844.51, 2);
  });

  it("the home-time month earns its running weeks, not the month minus a week of gross revenue", () => {
    const nov = fc.months[3];
    expect(nov.weeksOff).toBe(1);
    expect(nov.netIncome).toBeCloseTo(weekly * (W - 1), 2);
    expect(nov.incomeTax).toBeCloseTo(-(weekly * (W - 1)) * 0.2, 2);
    expect(nov.ending).toBeCloseTo(fc.months[2].ending + weekly * (W - 1) + 1804.61 - 2318 - weekly * (W - 1) * 0.2, 2);
  });

  it("a baseline month that held home time is normalized before it sets the pace", () => {
    const withHome = buildForecast(ACTUALS, ASSUMPTIONS, new Map([["2026-07-01", 2]]))!;
    expect(withHome.runningWeeks).toBeCloseTo(6 * W - 2, 4);
    expect(withHome.weeklyNet).toBeGreaterThan(fc.weeklyNet);
  });

  it("a loss month pays no tax and gets no refund", () => {
    const losing = ACTUALS.map((m) => ({ ...m, net_income: "-1000" }));
    const f = buildForecast(losing, ASSUMPTIONS, new Map())!;
    expect(f.months[0].netIncome).toBeLessThan(0);
    expect(f.months[0].incomeTax).toBe(-0);
  });

  it("the current calendar month is never an actual — a mid-month paste can't anchor the chain", () => {
    const withPartial = [...ACTUALS, { month: "2026-08-01", total_income: "5000", net_income: "900", ending_cash: "25000" }];
    const f = buildForecast(withPartial, ASSUMPTIONS, new Map(), 6, new Date("2026-08-12T12:00:00Z"))!;
    expect(f.baselineMonths.at(-1)).toBe("2026-07-01");
    expect(f.months[0].month).toBe("2026-08-01");
    expect(f.months[0].beginning).toBeCloseTo(24355.32, 2);
  });

  it("returns null with no actuals; averages what exists under 6", () => {
    expect(buildForecast([], ASSUMPTIONS, new Map())).toBeNull();
    const two = buildForecast(ACTUALS.slice(0, 2), ASSUMPTIONS, new Map())!;
    expect(two.baseline).toBeCloseTo((3877.8 + 4028.87) / 2, 2);
  });
});

describe("archiveGaps — the chain between months", () => {
  it("names a month that opens away from the previous ending; a clean chain is empty", () => {
    const rows = [
      { month: "2026-08-01", total_income: "1", net_income: "1", beginning_cash: "24355.32", ending_cash: "17206.46" },
      { month: "2026-09-01", total_income: "1", net_income: "1", beginning_cash: "17774.21", ending_cash: "23482.61" },
      { month: "2026-10-01", total_income: "1", net_income: "1", beginning_cash: "23482.61", ending_cash: "19056.21" },
    ];
    expect(archiveGaps(rows)).toEqual([{ month: "2026-09-01", prevMonth: "2026-08-01", beginning: 17774.21, prevEnding: 17206.46, diff: 567.75 }]);
    expect(archiveGaps(rows.slice(1))).toEqual([]);
  });
});

describe("pretaxMargin — real margin now that depreciation is in the P&L", () => {
  it("net income ÷ total income; null when no income", () => {
    expect(pretaxMargin(ACTUALS[5])!).toBeCloseTo(9337.69 / 33552.45, 6);
    expect(pretaxMargin({ month: "2026-01-01", total_income: "0", net_income: "0", ending_cash: "0" })).toBeNull();
  });
});

describe("qboPretaxMargin — the margin lever's number", () => {
  const NOW = new Date("2026-08-25T00:00:00Z");

  it("pools the last 3 closed months (Σni ÷ Σincome, not an average of ratios)", () => {
    const r = qboPretaxMargin(ACTUALS, NOW)!;
    // May–Jul: (8218.66 + 2896.27 + 9337.69) ÷ (28833.36 + 27745.72 + 33552.45)
    expect(r.margin).toBeCloseTo(20452.62 / 90131.53, 6);
    expect(r.label).toBe("May–Jul ’26");
  });

  it("sorts by month first — an unsorted archive still picks the LATEST three", () => {
    const shuffled = [ACTUALS[5], ACTUALS[0], ACTUALS[3], ACTUALS[1], ACTUALS[4], ACTUALS[2]];
    expect(qboPretaxMargin(shuffled, NOW)!.margin).toBeCloseTo(20452.62 / 90131.53, 6);
  });

  it("uses what exists under 3 months, labels a single month plainly", () => {
    const one = qboPretaxMargin([ACTUALS[5]], NOW)!;
    expect(one.margin).toBeCloseTo(9337.69 / 33552.45, 6);
    expect(one.label).toBe("Jul ’26");
  });

  it("excludes the CURRENT month — a mid-month partial paste must not grade the lever", () => {
    const partial = { month: "2026-08-01", total_income: "9000", net_income: "8000", ending_cash: "0" };
    const r = qboPretaxMargin([...ACTUALS, partial], NOW)!;
    expect(r.margin).toBeCloseTo(20452.62 / 90131.53, 6); // unchanged — Aug ignored
    expect(r.label).toBe("May–Jul ’26");
    expect(qboPretaxMargin([partial], NOW)).toBeNull(); // only a partial month → fall back
  });

  it("a cross-year window carries the year on BOTH ends", () => {
    const wrap = [
      { month: "2026-11-01", total_income: "100", net_income: "10", ending_cash: "0" },
      { month: "2026-12-01", total_income: "100", net_income: "10", ending_cash: "0" },
      { month: "2027-01-01", total_income: "100", net_income: "10", ending_cash: "0" },
    ];
    expect(qboPretaxMargin(wrap, new Date("2027-02-10T00:00:00Z"))!.label).toBe("Nov ’26–Jan ’27");
  });

  it("a gapped archive LISTS the pooled months instead of faking a range", () => {
    const gapped = [ACTUALS[1], ACTUALS[2], ACTUALS[5]]; // Mar, Apr, Jul
    const r = qboPretaxMargin(gapped, NOW)!;
    expect(r.label).toBe("Mar, Apr, Jul ’26");
  });

  it("null with an empty archive or zero income — the lever falls back, labeled", () => {
    expect(qboPretaxMargin([], NOW)).toBeNull();
    expect(
      qboPretaxMargin([{ month: "2026-07-01", total_income: "0", net_income: "0", ending_cash: "0" }], NOW),
    ).toBeNull();
  });
});
