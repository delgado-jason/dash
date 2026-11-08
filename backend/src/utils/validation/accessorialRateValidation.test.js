import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAccessorialRate } from "./accessorialRateValidation.js";

test("a valid rate passes; pass_through absent reads false", () => {
  assert.deepEqual(validateAccessorialRate({ accessorial_type: " Detention ", pay_pct: "0.73" }), {
    values: { accessorial_type: "Detention", pay_pct: 0.73, pass_through: false },
    errors: [],
  });
});
test("pass_through true and false pass as given", () => {
  assert.equal(validateAccessorialRate({ accessorial_type: "Tolls", pay_pct: 1, pass_through: true }).values.pass_through, true);
  assert.equal(validateAccessorialRate({ accessorial_type: "Tolls", pay_pct: 1, pass_through: false }).values.pass_through, false);
});
test("anything else for pass_through is refused", () => {
  for (const bad of ["yes", "true", 1, 0, null, ""])
    assert.equal(validateAccessorialRate({ accessorial_type: "Tolls", pay_pct: 1, pass_through: bad }).errors[0], "pass_through must be true or false", String(bad));
});
test("type and pct sentences", () => {
  assert.equal(validateAccessorialRate({ accessorial_type: " ", pay_pct: 1 }).errors[0], "accessorial_type is required");
  for (const bad of [undefined, null, "", "abc", -1, 2.5])
    assert.equal(validateAccessorialRate({ accessorial_type: "Tolls", pay_pct: bad }).errors[0], "pay_pct must be a fraction between 0 and 2");
  assert.equal(validateAccessorialRate(undefined).errors[0], "accessorial_type is required");
});
