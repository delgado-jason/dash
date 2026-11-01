import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { saveExpensePeriod } from "./expenseServices.js";

// The guard runs before any database work, so these never touch a pool.
describe("saveExpensePeriod — a month is never saved without its totals", () => {
  const line = { category: "Fuel", amount: 100, type: "variable", section: "cogs" };

  test("null totals are refused with the reason", async () => {
    await assert.rejects(
      saveExpensePeriod("u1", { period_month: "2026-10-01", income_total: null, cogs_total: null, expense_total: null, lines: [line] }),
      /needs its income, cost of goods sold and expense totals/,
    );
  });

  test("a missing one of the three is refused too", async () => {
    await assert.rejects(
      saveExpensePeriod("u1", { period_month: "2026-10-01", income_total: 16565.9, cogs_total: 3283.52, lines: [line] }),
      /needs its income/,
    );
  });

  test("a bad line is still refused after the totals pass", async () => {
    await assert.rejects(
      saveExpensePeriod("u1", { period_month: "2026-10-01", income_total: "16565.90", cogs_total: 0, expense_total: 15621.64, lines: [{ category: "", amount: 1, type: "variable" }] }),
      /each line needs category/,
    );
  });
});
