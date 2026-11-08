import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFscSchedule } from "./fscScheduleValidation.js";

const ok = () => ({
  effective_from: "2026-11-01",
  bands: [
    { low: 4.0, high: 4.049, cpm: 0.58 },
    { low: 4.05, high: null, cpm: 0.6 },
  ],
});
const first = (o) => validateFscSchedule({ ...ok(), ...o }).errors;

test("a valid table passes", () => assert.deepEqual(validateFscSchedule(ok()).errors, []));
test("effective_from required", () => {
  assert.equal(first({ effective_from: undefined })[0], "effective_from is required — the day the table starts (YYYY-MM-DD)");
  assert.match(first({ effective_from: "" })[0], /effective_from is required/);
});
test("effective_from must be a real day", () => {
  for (const bad of ["2026-02-30", "11/01/2026", 20261101])
    assert.equal(first({ effective_from: bad })[0], "effective_from must be a calendar day written YYYY-MM-DD");
});
test("bands shape", () => {
  for (const bad of [undefined, null, "x", [{ low: 4, cpm: undefined, high: null }, { low: 5, high: null, cpm: 1 }], [{ low: "", high: 1, cpm: 1 }, { low: 5, high: null, cpm: 1 }], [{ low: 4, high: "x", cpm: 1 }, { low: 5, high: null, cpm: 1 }], [1, 2]])
    assert.deepEqual(first({ bands: bad }), ["bands must be a list of { low, high, cpm }"]);
});
test("at least two bands", () => assert.deepEqual(first({ bands: [{ low: 4, high: null, cpm: 0.5 }] }), ["a surcharge table needs at least two bands"]));
test("backwards", () =>
  assert.ok(first({ bands: [{ low: 4.3, high: 4.2, cpm: 0.5 }, { low: 4.5, high: null, cpm: 0.6 }] }).includes("the band $4.30–$4.20 runs backwards")));
test("cpm outside 0-5", () => {
  assert.ok(first({ bands: [{ low: 4, high: 4.4, cpm: 0.5 }, { low: 4.5, high: null, cpm: 6 }] }).includes("the band $4.50 and up pays $6.00 a mile — outside $0–$5"));
  assert.match(first({ bands: [{ low: 4, high: 4.4, cpm: -0.1 }, { low: 4.5, high: null, cpm: 0.6 }] })[0], /outside \$0–\$5/);
});
test("open band must be last", () =>
  assert.ok(first({ bands: [{ low: 4, high: null, cpm: 0.5 }, { low: 4.5, high: 4.6, cpm: 0.6 }] }).includes('only the last band can run "and up"')));
test("overlap", () =>
  assert.ok(first({ bands: [{ low: 4, high: 4.1, cpm: 0.5 }, { low: 4.05, high: 4.149, cpm: 0.6 }] }).includes("the bands $4.00–$4.10 and $4.05–$4.149 overlap")));
test("values are numeric and sorted", () => {
  const { values } = validateFscSchedule({ effective_from: " 2026-11-01 ", bands: [{ low: "4.05", high: null, cpm: "0.6" }, { low: "4", high: "4.049", cpm: "0.58" }] });
  assert.deepEqual(values.bands, [{ low: 4, high: 4.049, cpm: 0.58 }, { low: 4.05, high: null, cpm: 0.6 }]);
  assert.equal(values.effective_from, "2026-11-01");
});
test("note is trimmed, nulled, capped", () => {
  assert.equal(validateFscSchedule({ ...ok(), note: "  hi " }).values.note, "hi");
  assert.equal(validateFscSchedule({ ...ok(), note: "  " }).values.note, null);
  assert.equal(first({ note: "x".repeat(201) })[0], "note is longer than 200 characters");
});
