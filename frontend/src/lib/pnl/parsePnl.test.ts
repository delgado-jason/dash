import { describe, it, expect } from "vitest";
import { parsePnlRows, classifyExpenses, cleanNum } from "./parsePnl";
import { labelToMonth } from "./parseFile";

// A faithful miniature of the real QuickBooks P&L structure: a parent with a
// direct amount + children + total, a nested group, standalones, a COGS group,
// income (ignored), and section totals.
const ROWS: string[][] = [
  ["Delgado Trucking Services", "", ""],
  ["Profit and Loss", "", ""],
  ["June 2026", "", ""],
  ["", "Total", ""],
  ["", "Jun 2026", "May 2026 (PP)"],
  ["Income", "", ""],
  ["Landstar Commissions", "-1,000.00", "-1,000.00"],
  ["Linehaul", "6,000.00", "6,000.00"],
  ["Total for Income", "5,000.00", "5,000.00"],
  ["Cost of Goods Sold", "", ""],
  ["Cost of goods sold", "", ""],
  ["Fuel", "400.00", "500.00"],
  ["Total for Cost of goods sold", "400.00", "500.00"],
  ["Total for Cost of Goods Sold", "400.00", "500.00"],
  ["Expenses", "", ""],
  ["Commissions & fees", "5.00", "5.00"], // parent WITH a direct amount
  ["Card Fee", "17.00", "20.00"],
  ["Total for Commissions & fees", "22.00", "25.00"],
  ["Direct Deposit Fee", "7.00", "5.00"], // standalone
  ["Employee benefits", "", ""], // nested group
  ["Health insurance & accident plans", "", ""],
  ["Health Ins", "380.45", "380.45"],
  ["Total for Health insurance & accident plans", "380.45", "380.45"],
  ["Total for Employee benefits", "380.45", "380.45"],
  ["Insurance", "", ""],
  ["CPP", "125.00", "125.00"],
  ["Total for Insurance", "125.00", "125.00"],
  ["Wages", "700.00", "500.00"], // standalone, changed
  ["Total for Expenses", "1,234.45", "1,035.45"],
  ["Net Operating Income", "3,365.55", "", ""],
];

describe("cleanNum", () => {
  it("strips currency formatting and handles blanks/negatives", () => {
    expect(cleanNum("$2,547.70")).toBeCloseTo(2547.7, 5);
    expect(cleanNum("-10,936.24")).toBeCloseTo(-10936.24, 5);
    expect(cleanNum("")).toBeNull();
    expect(cleanNum(undefined)).toBeNull();
  });
});

describe("parsePnlRows", () => {
  const parsed = parsePnlRows(ROWS);

  it("captures the month labels and section totals", () => {
    expect(parsed.currentLabel).toBe("Jun 2026");
    expect(parsed.priorLabel).toBe("May 2026");
    expect(parsed.incomeTotal).toBe(5000);
    expect(parsed.cogsTotal).toBe(400);
    expect(parsed.expenseTotal).toBe(1234.45);
  });

  it("emits one line per top-level category, collapsing groups (no double-count)", () => {
    const expenses = parsed.lines.filter((l) => l.section === "expenses");
    expect(expenses.map((l) => l.name)).toEqual([
      "Commissions & fees",
      "Direct Deposit Fee",
      "Employee benefits",
      "Insurance",
      "Wages",
    ]);
    // parent-with-direct-amount rolled into its total (5 + 17 = 22)
    expect(expenses.find((l) => l.name === "Commissions & fees")?.current).toBe(22);
  });

  it("reconciles: emitted expense lines sum to the Expenses section total", () => {
    const sum = parsed.lines
      .filter((l) => l.section === "expenses")
      .reduce((s, l) => s + l.current, 0);
    expect(sum).toBeCloseTo(parsed.expenseTotal ?? -1, 2);
  });

  it("collapses the COGS group and ignores Income lines", () => {
    const cogs = parsed.lines.filter((l) => l.section === "cogs");
    expect(cogs).toHaveLength(1);
    expect(cogs[0].current).toBe(400);
    expect(parsed.lines.some((l) => l.name === "Landstar Commissions")).toBe(false);
  });
});

describe("classifyExpenses", () => {
  it("marks unchanged lines fixed, movers variable, with keyword fallback", () => {
    const classified = classifyExpenses(parsePnlRows(ROWS).lines);
    const byName = Object.fromEntries(classified.map((l) => [l.name, l.type]));
    expect(byName["Insurance"]).toBe("fixed"); // 125 == 125
    expect(byName["Employee benefits"]).toBe("fixed"); // 380.45 == 380.45
    expect(byName["Wages"]).toBe("variable"); // 700 != 500, no keyword → variable
    expect(byName["Cost of goods sold"]).toBe("variable"); // changed
  });
});

// The NORMAL upload: a single month (no prior-period column).
const SINGLE_MONTH: string[][] = [
  ["Delgado Trucking Services", ""],
  ["Profit and Loss", ""],
  ["", "Jun 2026"],
  ["Income", ""],
  ["Landstar Commissions", "-1,000.00"],
  ["Total for Income", "5,000.00"],
  ["Expenses", ""],
  ["Direct Deposit Fee", "7.00"],
  ["Insurance", ""],
  ["CPP", "125.00"],
  ["Total for Insurance", "125.00"],
  ["Wages", "700.00"],
  ["Total for Expenses", "832.00"],
];

describe("parsePnlRows — single-month file (the normal case)", () => {
  const parsed = parsePnlRows(SINGLE_MONTH);

  it("parses and reconciles with no prior column", () => {
    expect(parsed.currentLabel).toBe("Jun 2026");
    expect(parsed.expenseTotal).toBe(832);
    const expenses = parsed.lines.filter((l) => l.section === "expenses");
    expect(expenses.map((l) => l.name)).toEqual([
      "Direct Deposit Fee",
      "Insurance",
      "Wages",
    ]);
    expect(expenses.every((l) => l.prior === null)).toBe(true);
    expect(expenses.reduce((s, l) => s + l.current, 0)).toBeCloseTo(832, 2);
  });

  it("classifies by keyword when there's no prior month to compare", () => {
    const byName = Object.fromEntries(
      classifyExpenses(parsed.lines).map((l) => [l.name, l.type]),
    );
    expect(byName["Insurance"]).toBe("fixed"); // keyword
    expect(byName["Wages"]).toBe("variable"); // unknown mover → variable
  });
});

// The format QuickBooks actually exports for a SINGLE period (no comparison
// column): the month lives in the title's first cell ("July 2026"), the data
// column header is just "Total", and a timestamp footer trails the report.
// Regression for "Couldn't read the month from this file" — period_month was
// coming back null because the month wasn't in a blank-first-cell header row.
const SINGLE_PERIOD_TITLE_MONTH: string[][] = [
  ["Delgado Trucking Services", ""],
  ["Profit and Loss", ""],
  ["July 2026", ""],
  [""],
  ["", "Total"],
  ["Income", ""],
  ["Landstar Commissions", "-1,000.00"],
  ["Truck Revenue", ""],
  ["Line Haul", "6,000.00"],
  ["Total for Truck Revenue", "$6,000.00"],
  ["Total for Income", "$5,000.00"],
  ["Cost of Goods Sold", ""],
  ["Cost of goods sold", ""],
  ["Fuel", "400.00"],
  ["Total for Cost of goods sold", "$400.00"],
  ["Total for Cost of Goods Sold", "$400.00"],
  ["Gross Profit", "$4,600.00"],
  ["Expenses", ""],
  ["Insurance", ""],
  ["CPP", "125.00"],
  ["Total for Insurance", "$125.00"],
  ["Wages", "700.00"],
  ["Total for Expenses", "$825.00"],
  ["Net Operating Income", "$3,775.00"],
  ["Net Income", "$3,775.00"],
  [""],
  ["Accrual Basis Sunday, August 02, 2026 06:22 PM GMT-04:00", ""],
];

describe("parsePnlRows — single-period export (month in the title, no comparison column)", () => {
  const parsed = parsePnlRows(SINGLE_PERIOD_TITLE_MONTH);

  it("recovers the month from the title, not the timestamp footer", () => {
    expect(parsed.currentLabel).toBe("July 2026");
    expect(labelToMonth(parsed.currentLabel)).toBe("2026-07-01"); // the check the upload makes
    expect(parsed.priorLabel).toBeNull();
  });

  it("still parses totals and expense lines from the single Total column", () => {
    expect(parsed.incomeTotal).toBe(5000);
    expect(parsed.cogsTotal).toBe(400);
    expect(parsed.expenseTotal).toBe(825);
    const expenses = parsed.lines.filter((l) => l.section === "expenses");
    expect(expenses.map((l) => l.name)).toEqual(["Insurance", "Wages"]);
    expect(expenses.every((l) => l.prior === null)).toBe(true);
  });
});
