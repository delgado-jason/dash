import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateSchedule } from "./settlementScheduleValidation.js";

const stored = {
  rate_tier_std_min: 0.1, rate_tier_std_target: 0.2, rate_tier_std_strong: 0.3,
  rate_tier_spec_min: 0.35, rate_tier_spec_target: 0.45, rate_tier_spec_strong: 0.6,
};

describe("validateSchedule — the pay split is gone (NET-01)", () => {
  test("the four pcts are no longer read: they are not returned and not judged", () => {
    const bad = { linehaul_pct: null, trailer_pct: 5, fuel_surcharge_pct: "abc", accessorial_pct: -1 };
    assert.deepEqual(validateSchedule(bad), { values: {}, errors: [] });
  });
});

describe("validateSchedule — the lifted checks", () => {
  test("carrier_name trims to null", () => {
    assert.equal(validateSchedule({ carrier_name: "  " }).values.carrier_name, null);
    assert.equal(validateSchedule({ carrier_name: " Acme " }).values.carrier_name, "Acme");
  });
  test("bounds and wholeness", () => {
    assert.match(validateSchedule({ detention_free_hours: 25 }).errors[0], /detention_free_hours must be between 0 and 24/);
    assert.match(validateSchedule({ settlement_day: 7 }).errors[0], /settlement_day must be a day of week/);
    assert.match(validateSchedule({ settlement_day: 2.5 }).errors[0], /settlement_day must be a day of week/);
    assert.match(validateSchedule({ deposit_lag_days: -1 }).errors[0], /deposit_lag_days/);
    assert.match(validateSchedule({ per_diem_deduct_pct: 1.2 }).errors[0], /per_diem_deduct_pct/);
    assert.match(validateSchedule({ hometime_threshold_days: 0 }).errors[0], /hometime_threshold_days/);
    assert.match(validateSchedule({ margin_goal: 1 }).errors[0], /margin_goal must be a fraction between 0 and 1/);
    assert.match(validateSchedule({ rate_tier_std_min: 3.5 }).errors[0], /between 0 and 3/);
    assert.match(validateSchedule({ operation: "boat" }).errors[0], /operation must be one of/);
    assert.deepEqual(validateSchedule({ settlement_day: 3, deposit_lag_days: 1, margin_goal: 0.26, operation: "flatbed" }).errors, []);
  });
  test("a blank on a non-pct number is refused too", () => {
    assert.match(validateSchedule({ settlement_day: "" }).errors[0], /settlement_day needs a number/);
  });
  test("tier sets must ascend, judged on the merge", () => {
    assert.match(validateSchedule({ rate_tier_std_min: 0.5 }, stored).errors[0], /standard rate tiers must ascend/);
    assert.match(validateSchedule({ rate_tier_spec_strong: 0.2 }, stored).errors[0], /specialized rate tiers must ascend/);
    assert.deepEqual(validateSchedule({ rate_tier_std_min: 0.15 }, stored).errors, []);
  });
});
