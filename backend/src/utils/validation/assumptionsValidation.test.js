import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateAssumptions } from "./assumptionsValidation.js";

describe("validateAssumptions — a blank is not $0", () => {
  test("the prod row passes and normalizes to numbers", () => {
    const { values, errors } = validateAssumptions({
      fed_tax_rate: "0.15", state_tax_rate: 0.05, weekly_payroll: 1908, weekly_revenue: 4647,
      weekly_fuel_advance: 2000, weekly_settlement_deductions: "361.99", financing_floor: -2318,
    });
    assert.deepEqual(errors, []);
    assert.equal(values.fed_tax_rate, 0.15);
    assert.equal(values.weekly_settlement_deductions, 361.99);
    assert.equal(values.financing_floor, -2318);
  });
  test("only the fields present are judged (a patch)", () => {
    assert.deepEqual(validateAssumptions({}), { values: {}, errors: [] });
    assert.deepEqual(validateAssumptions({ weekly_payroll: 0 }).values, { weekly_payroll: 0 });
  });
  test("null, blank, text and NaN are all refused", () => {
    for (const bad of [null, "", "  ", "abc", NaN, Infinity, true, []]) {
      const { errors } = validateAssumptions({ weekly_payroll: bad });
      assert.equal(errors.length, 1, String(bad));
      assert.match(errors[0], /weekly_payroll needs a number/);
    }
  });
  test("a rate is a fraction", () => {
    assert.match(validateAssumptions({ fed_tax_rate: 15 }).errors[0], /fed_tax_rate is a fraction — 15% is 0\.15/);
    assert.match(validateAssumptions({ state_tax_rate: -0.1 }).errors[0], /state_tax_rate is a fraction/);
    assert.deepEqual(validateAssumptions({ fed_tax_rate: 0 }).errors, []);
    assert.deepEqual(validateAssumptions({ fed_tax_rate: 1 }).errors, []);
  });
  test("dollar fields can't be negative; financing_floor can", () => {
    for (const f of ["weekly_payroll", "weekly_revenue", "weekly_fuel_advance", "weekly_settlement_deductions", "monthly_depreciation", "tax_catchup_owed"])
      assert.match(validateAssumptions({ [f]: -1 }).errors[0], new RegExp(`${f} can't be negative`));
    assert.deepEqual(validateAssumptions({ financing_floor: -1 }).errors, []);
    assert.deepEqual(validateAssumptions({ financing_floor: 500 }).errors, []);
  });
  test("every bad field is reported, not just the first", () => {
    assert.equal(validateAssumptions({ weekly_payroll: null, fed_tax_rate: 15 }).errors.length, 2);
  });
});
