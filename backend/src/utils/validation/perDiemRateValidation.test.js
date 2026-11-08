import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePerDiemRate } from "./perDiemRateValidation.js";

const ok = { effective_from: "2026-10-01", rate: 86 };

test("effective_from missing or blank is required", () => {
  assert.equal(validatePerDiemRate({ rate: 86 }).errors[0], "effective_from is required — the day the rate starts (YYYY-MM-DD)");
  assert.match(validatePerDiemRate({ ...ok, effective_from: "" }).errors[0], /effective_from is required/);
});
test("effective_from must be a real calendar day", () => {
  for (const bad of ["2026-02-30", "10/01/2026", "2026-13-01", 20261001])
    assert.equal(validatePerDiemRate({ ...ok, effective_from: bad }).errors[0], "effective_from must be a calendar day written YYYY-MM-DD");
});
test("a future start date is allowed", () => {
  assert.deepEqual(validatePerDiemRate({ ...ok, effective_from: "2031-01-01" }).errors, []);
});
test("rate blank is refused, never zero", () => {
  assert.equal(validatePerDiemRate({ effective_from: "2026-10-01" }).errors[0], "rate is required — a blank would read as no per diem");
  assert.match(validatePerDiemRate({ ...ok, rate: null }).errors[0], /rate is required/);
  assert.match(validatePerDiemRate({ ...ok, rate: "  " }).errors[0], /rate is required/);
});
test("rate outside 1–500 or not a number", () => {
  for (const bad of [0, 0.99, 501, "abc", NaN, Infinity])
    assert.equal(validatePerDiemRate({ ...ok, rate: bad }).errors[0], "rate must be between $1 and $500 a day");
  assert.deepEqual(validatePerDiemRate({ ...ok, rate: 1 }).errors, []);
  assert.deepEqual(validatePerDiemRate({ ...ok, rate: 500 }).errors, []);
});
test("note is trimmed, null when blank, capped at 200", () => {
  assert.equal(validatePerDiemRate({ ...ok, note: "  hi " }).values.note, "hi");
  assert.equal(validatePerDiemRate({ ...ok, note: "   " }).values.note, null);
  assert.equal(validatePerDiemRate({ ...ok, note: "x".repeat(201) }).errors[0], "note is longer than 200 characters");
  assert.deepEqual(validatePerDiemRate({ ...ok, note: "x".repeat(200) }).errors, []);
});
test("partial only judges what is sent", () => {
  assert.deepEqual(validatePerDiemRate({}, { partial: true }), { values: {}, errors: [] });
  assert.match(validatePerDiemRate({ rate: "" }, { partial: true }).errors[0], /rate is required/);
  assert.match(validatePerDiemRate({ effective_from: "nope" }, { partial: true }).errors[0], /calendar day/);
});
