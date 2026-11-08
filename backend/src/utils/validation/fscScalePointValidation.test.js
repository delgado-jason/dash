import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFscScalePoint } from "./fscScalePointValidation.js";

const ok = () => ({
  week_of: "2026-11-03",
  national_avg: 6.292,
  cents_per_mile: 0.86,
  pct_of_linehaul: 0.52,
  regions: [
    { region: "PADD 1A", price: 6.416, cpm: 0.88 },
    { region: "PADD 4", price: 6.445, cpm: 0.89 },
    { region: "PADD 5", price: 7.272, cpm: 1.03 },
  ],
});
const errs = (o) => validateFscScalePoint({ ...ok(), ...o }).errors;

test("a valid point passes, numeric", () => {
  const { values, errors } = validateFscScalePoint({ ...ok(), national_avg: "6.292", cents_per_mile: "0.86", pct_of_linehaul: "0.52", note: " hi " });
  assert.deepEqual(errors, []);
  assert.deepEqual(values, { ...ok(), note: "hi" });
});
test("week_of required", () => {
  for (const b of [undefined, null, "", "  "])
    assert.deepEqual(errs({ week_of: b }), ["week_of is required — the report's first effective day (YYYY-MM-DD)"]);
});
test("week_of must be a real day", () => {
  for (const b of ["2026-02-30", "11/03/2026", 20261103])
    assert.deepEqual(errs({ week_of: b }), ["week_of must be a calendar day written YYYY-MM-DD"]);
});
test("national_avg", () => {
  for (const b of [undefined, null, "", "x", 0, -1, 25, true])
    assert.deepEqual(errs({ national_avg: b }), ["national_avg must be a diesel price between $0 and $20 a gallon"]);
  assert.deepEqual(errs({ national_avg: 20 }), []);
});
test("cents_per_mile (cents are not converted)", () => {
  for (const b of [undefined, null, "", "x", -0.1, 5.01, 86])
    assert.deepEqual(errs({ cents_per_mile: b }), ["cents_per_mile must be between $0 and $5 a loaded mile (0.86 = 86¢)"]);
  assert.deepEqual(errs({ cents_per_mile: 0 }), []);
  assert.deepEqual(errs({ cents_per_mile: 5 }), []);
});
test("pct_of_linehaul optional, null when blank", () => {
  for (const b of [undefined, null, ""]) assert.equal(validateFscScalePoint({ ...ok(), pct_of_linehaul: b }).values.pct_of_linehaul, null);
  for (const b of [6, -1, "x"])
    assert.deepEqual(errs({ pct_of_linehaul: b }), ["pct_of_linehaul must be a fraction 0–5 (0.52 = 52%)"]);
});
test("regions optional, [] when absent", () => {
  for (const b of [undefined, null]) assert.deepEqual(validateFscScalePoint({ ...ok(), regions: b }).values.regions, []);
});
test("regions shape", () => {
  const S = ["regions must be a list of { region, price, cpm }"];
  for (const b of ["x", {}, [1], [{ region: "PADD 1A", price: 6.4 }], [{ region: "", price: 6.4, cpm: 0.8 }],
    [{ region: "x".repeat(21), price: 6.4, cpm: 0.8 }], [{ region: "PADD 1A", price: 0, cpm: 0.8 }], [{ region: "PADD 1A", price: 6.4, cpm: 9 }]])
    assert.deepEqual(errs({ regions: b }), S);
});
test("note trimmed, nulled, capped", () => {
  assert.equal(validateFscScalePoint({ ...ok(), note: "  " }).values.note, null);
  assert.deepEqual(errs({ note: "x".repeat(201) }), ["note is longer than 200 characters"]);
});
