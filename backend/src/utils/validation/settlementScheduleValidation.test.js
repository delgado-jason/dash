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

describe("validateSchedule — equipment & permits (migration 110)", () => {
  const ok = (d) => validateSchedule(d);

  test("A BLANK IS A REAL ANSWER for all three — unset is reachable", () => {
    // Not pedantry. A guessed empty weight silently reclassifies heavy freight
    // onto the Standard ladder, which is the exact bug the field exists to kill,
    // so "I have not said" must stay distinguishable from a number.
    for (const f of ["empty_weight_lb", "permit_cost_usd", "escort_cost_per_loaded_mile"]) {
      assert.deepEqual(ok({ [f]: null }), { values: { [f]: null }, errors: [] }, f);
      assert.deepEqual(ok({ [f]: "" }), { values: { [f]: null }, errors: [] }, f);
    }
  });

  test("absent is not the same as blank — an untouched field is never written", () => {
    assert.deepEqual(ok({}), { values: {}, errors: [] });
  });

  test("ZERO IS A CLAIM ABOUT COSTS AND NONSENSE ABOUT WEIGHT", () => {
    // "Permits cost me nothing" is coherent. "My truck weighs nothing" is not,
    // and it would put the freight ceiling at the full 80,000.
    assert.equal(ok({ permit_cost_usd: 0 }).values.permit_cost_usd, 0);
    assert.equal(ok({ escort_cost_per_loaded_mile: 0 }).values.escort_cost_per_loaded_mile, 0);
    assert.equal(ok({ empty_weight_lb: 0 }).errors.length, 1);
    assert.equal(ok({ empty_weight_lb: 0 }).values.empty_weight_lb, undefined);
  });

  test("Jason's real figures pass", () => {
    const r = ok({ empty_weight_lb: 32000, permit_cost_usd: 40, escort_cost_per_loaded_mile: 2 });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.values, {
      empty_weight_lb: 32000,
      permit_cost_usd: 40,
      escort_cost_per_loaded_mile: 2,
    });
  });

  test("an empty weight at or over the legal gross is refused", () => {
    // 80,000 empty leaves no freight ceiling at all.
    assert.equal(ok({ empty_weight_lb: 79999 }).errors.length, 0);
    assert.equal(ok({ empty_weight_lb: 80000 }).errors.length, 1);
    assert.equal(ok({ empty_weight_lb: -1 }).errors.length, 1);
  });

  test("the empty weight must be whole pounds; the costs may be cents", () => {
    assert.equal(ok({ empty_weight_lb: 32000.5 }).errors.length, 1);
    assert.equal(ok({ permit_cost_usd: 42.5 }).values.permit_cost_usd, 42.5);
    assert.equal(ok({ escort_cost_per_loaded_mile: 2.25 }).values.escort_cost_per_loaded_mile, 2.25);
  });

  test("typo guards at the top end, and non-numbers say so", () => {
    assert.equal(ok({ permit_cost_usd: 5001 }).errors.length, 1);
    assert.equal(ok({ escort_cost_per_loaded_mile: 101 }).errors.length, 1);
    const r = ok({ empty_weight_lb: "heavy" });
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /leave it empty to unset it/);
  });

  test("numeric strings from a form field are accepted", () => {
    const r = ok({ empty_weight_lb: "32000", permit_cost_usd: "40.00" });
    assert.deepEqual(r.errors, []);
    assert.equal(r.values.empty_weight_lb, 32000);
    assert.equal(r.values.permit_cost_usd, 40);
  });
});
