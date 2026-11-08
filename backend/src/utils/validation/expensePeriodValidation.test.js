import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateExpensePeriod } from "./expensePeriodValidation.js";

const base = () => ({
  period_month: "2026-10-01",
  totals: { income_total: 100, cogs_total: 30, expense_total: 20 },
  lines: [
    { category: "Fuel", amount: 30, section: "cogs" },
    { category: "Rent", amount: 20 }, // no section → expenses
    { category: "Sales", amount: 100, section: "income" },
  ],
});

describe("validateExpensePeriod", () => {
  test("a clean month passes", () => assert.deepEqual(validateExpensePeriod(base()), []));
  test("period_month must be a real first of the month", () => {
    assert.match(validateExpensePeriod({ ...base(), period_month: "2026-10-15" })[0], /a P&L month is the 1st — 2026-10-15 would create a second October/);
    assert.match(validateExpensePeriod({ ...base(), period_month: "2026-02-30" })[0], /period_month must be a real YYYY-MM-DD date/);
    assert.match(validateExpensePeriod({ ...base(), period_month: undefined })[0], /period_month must be a real/);
  });
  test("every line amount is finite", () => {
    const p = base();
    p.lines[0].amount = "abc";
    assert.match(validateExpensePeriod(p)[0], /line 1 \(Fuel\) needs a numeric amount/);
    p.lines[0].amount = Infinity;
    assert.match(validateExpensePeriod(p)[0], /needs a numeric amount/);
  });
  test("section is cogs, expenses or income", () => {
    const p = base();
    p.lines[1].section = "other";
    assert.match(validateExpensePeriod(p)[0], /line 2 \(Rent\) has section 'other'/);
  });
  test("lines reconcile to the totals within $0.01, per section", () => {
    const p = base();
    p.totals.cogs_total = 19849;
    assert.match(validateExpensePeriod(p)[0], /Cost of goods sold lines add to \$30\.00 but the file's total says \$19,849\.00 — re-export the P&L/);
    const q = base();
    q.totals.expense_total = 25;
    assert.match(validateExpensePeriod(q)[0], /Expense lines add to \$20\.00 but the file's total says \$25\.00/);
    const r = base();
    r.totals.expense_total = 20.01;
    assert.deepEqual(validateExpensePeriod(r), []);
    r.totals.expense_total = 20.02;
    assert.equal(validateExpensePeriod(r).length, 1);
  });
  test("no sum is reported when a line is unreadable", () => {
    const p = base();
    p.lines[0].amount = "abc";
    p.totals.cogs_total = 999;
    assert.equal(validateExpensePeriod(p).length, 1);
  });
  test("a month with totals and no lines does not reconcile", () => {
    assert.equal(validateExpensePeriod({ ...base(), lines: [] }).length, 2);
  });
});
