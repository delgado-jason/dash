import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateSchedule } from "./settlementScheduleValidation.js";

const prod = { linehaul_pct: 0.65, trailer_pct: 0.08, fuel_surcharge_pct: 1, accessorial_pct: 0.73 };
const stored = {
  ...prod, rate_tier_std_min: 0.1, rate_tier_std_target: 0.2, rate_tier_std_strong: 0.3,
  rate_tier_spec_min: 0.35, rate_tier_spec_target: 0.45, rate_tier_spec_strong: 0.6,
};

describe("validateSchedule — pcts", () => {
  test("the prod schedule passes", () => {
    assert.deepEqual(validateSchedule(prod), { values: prod, errors: [] });
  });
  test("null, '' and text are refused — never Number(null) = 0", () => {
    for (const bad of [null, "", "  ", "abc", NaN]) {
      const { errors, values } = validateSchedule({ linehaul_pct: bad });
      assert.match(errors[0], /linehaul_pct needs a number — a blank would zero every load's net/, String(bad));
      assert.equal("linehaul_pct" in values, false);
    }
  });
  test("pcts are 0–1 (tightened from 0–2)", () => {
    assert.match(validateSchedule({ fuel_surcharge_pct: 1.01 }).errors[0], /fraction between 0 and 1/);
    assert.match(validateSchedule({ accessorial_pct: -0.01 }).errors[0], /fraction between 0 and 1/);
    assert.deepEqual(validateSchedule({ fuel_surcharge_pct: 1, trailer_pct: 0 }).errors, []);
  });
  test("linehaul_pct + trailer_pct ≤ 1, on what arrives and on the merge", () => {
    assert.match(validateSchedule({ linehaul_pct: 0.95, trailer_pct: 0.08 }).errors[0], /add to more than 1/);
    assert.match(validateSchedule({ trailer_pct: 0.4 }, stored).errors[0], /add to more than 1/);
    assert.deepEqual(validateSchedule({ linehaul_pct: 0.92, trailer_pct: 0.08 }).errors, []);
    assert.deepEqual(validateSchedule({ trailer_pct: 0.4 }).errors, []); // other half unknown
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
    assert.match(validateSchedule({ per_diem_rate: 501 }).errors[0], /per_diem_rate must be between 0 and 500/);
    assert.match(validateSchedule({ per_diem_deduct_pct: 1.2 }).errors[0], /per_diem_deduct_pct/);
    assert.match(validateSchedule({ hometime_threshold_days: 0 }).errors[0], /hometime_threshold_days/);
    assert.match(validateSchedule({ margin_goal: 1 }).errors[0], /margin_goal must be a fraction between 0 and 1/);
    assert.match(validateSchedule({ rate_tier_std_min: 3.5 }).errors[0], /between 0 and 3/);
    assert.match(validateSchedule({ operation: "boat" }).errors[0], /operation must be one of/);
    assert.deepEqual(validateSchedule({ settlement_day: 3, deposit_lag_days: 1, margin_goal: 0.26, operation: "flatbed" }).errors, []);
  });
  test("a blank on a non-pct number is refused too", () => {
    assert.match(validateSchedule({ per_diem_rate: null }).errors[0], /per_diem_rate needs a number/);
    assert.match(validateSchedule({ settlement_day: "" }).errors[0], /settlement_day needs a number/);
  });
  test("tier sets must ascend, judged on the merge", () => {
    assert.match(validateSchedule({ rate_tier_std_min: 0.5 }, stored).errors[0], /standard rate tiers must ascend/);
    assert.match(validateSchedule({ rate_tier_spec_strong: 0.2 }, stored).errors[0], /specialized rate tiers must ascend/);
    assert.deepEqual(validateSchedule({ rate_tier_std_min: 0.15 }, stored).errors, []);
  });
});
