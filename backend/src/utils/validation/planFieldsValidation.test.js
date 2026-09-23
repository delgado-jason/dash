import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlanFields } from "./planFieldsValidation.js";

test("the policy's numbers pass through as numbers", () => {
  const out = validatePlanFields({ maintenance_per_mile: "0.32", tax_pct: "20", maintenance_floor: "5000", min_move: "500", objective_pct: "70", first_money_month: "2026-08" });
  assert.deepEqual(out, { maintenance_per_mile: 0.32, tax_pct: 20, maintenance_floor: 5000, min_move: 500, objective_pct: 70, first_money_month: "2026-08-01" });
});

test("a blank rate is refused — it would land as 0 and stop the accrual", () => {
  assert.throws(() => validatePlanFields({ maintenance_per_mile: "" }), /needs a number/);
  assert.throws(() => validatePlanFields({ tax_pct: null }), /needs a number/);
  assert.throws(() => validatePlanFields({ min_move: "five hundred" }), /between 0 and/);
});

test("percentages run 0–100; the per-mile rate stays sane", () => {
  assert.throws(() => validatePlanFields({ tax_pct: 120 }), /between 0 and 100/);
  assert.throws(() => validatePlanFields({ objective_pct: -5 }), /between 0 and 100/);
  assert.throws(() => validatePlanFields({ maintenance_per_mile: 32 }), /between 0 and 10/);
});

test("home-week bounds may be cleared; the year is a whole year", () => {
  assert.deepEqual(validatePlanFields({ float_line_home_lo: "", float_line_home_hi: null }), { float_line_home_lo: null, float_line_home_hi: null });
  assert.equal(validatePlanFields({ year: "2028" }).year, 2028);
  assert.throws(() => validatePlanFields({ year: "28" }), /whole year/);
});

test("the first money month is the first of a month", () => {
  assert.equal(validatePlanFields({ first_money_month: "2026-09-01" }).first_money_month, "2026-09-01");
  assert.throws(() => validatePlanFields({ first_money_month: "2026-09-15" }), /first of a month/);
  assert.throws(() => validatePlanFields({ first_money_month: "" }), /first of a month/);
});

test("fields that aren't sent are left alone", () => {
  assert.deepEqual(validatePlanFields({ label: "The 2027 Plan" }), { label: "The 2027 Plan" });
});
