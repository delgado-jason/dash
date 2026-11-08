import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSettlementSplit, SPLIT_PCT_FIELDS } from "./settlementSplitValidation.js";

const ok = {
  effective_from: "2026-02-03",
  linehaul_pct: 0.65,
  trailer_pct: 0.08,
  fuel_surcharge_pct: 1,
  accessorial_pct: 0.73,
};
const pctSentence = (f) => `${f} must be a fraction 0–1 (a blank would read as 0)`;

test("the pct field list is the four shares", () => {
  assert.deepEqual(SPLIT_PCT_FIELDS, ["linehaul_pct", "trailer_pct", "fuel_surcharge_pct", "accessorial_pct"]);
});
test("the prod split passes and comes back as numbers", () => {
  assert.deepEqual(validateSettlementSplit(ok), { values: ok, errors: [] });
  assert.equal(validateSettlementSplit({ ...ok, linehaul_pct: "0.65" }).values.linehaul_pct, 0.65);
});
test("effective_from missing or blank is required", () => {
  const { effective_from, ...rest } = ok;
  assert.equal(validateSettlementSplit(rest).errors[0], "effective_from is required — the day the split starts (YYYY-MM-DD)");
  assert.match(validateSettlementSplit({ ...ok, effective_from: "" }).errors[0], /effective_from is required/);
  assert.match(validateSettlementSplit({ ...ok, effective_from: null }).errors[0], /effective_from is required/);
});
test("effective_from must be a real calendar day", () => {
  for (const bad of ["2026-02-30", "02/03/2026", "2026-13-01", 20260203])
    assert.equal(validateSettlementSplit({ ...ok, effective_from: bad }).errors[0], "effective_from must be a calendar day written YYYY-MM-DD");
});
test("every pct is required — a blank is never 0", () => {
  for (const f of SPLIT_PCT_FIELDS) {
    const { [f]: _gone, ...rest } = ok;
    assert.equal(validateSettlementSplit(rest).errors[0], pctSentence(f));
    for (const bad of [null, "", "  "])
      assert.equal(validateSettlementSplit({ ...ok, [f]: bad }).errors[0], pctSentence(f));
  }
});
test("every pct is 0–1 and numeric", () => {
  for (const f of SPLIT_PCT_FIELDS)
    for (const bad of [1.2, -0.01, "abc", NaN, true])
      assert.equal(validateSettlementSplit({ ...ok, [f]: bad }).errors[0], pctSentence(f), `${f} ${bad}`);
  assert.deepEqual(validateSettlementSplit({ ...ok, fuel_surcharge_pct: 1, trailer_pct: 0 }).errors, []);
});
test("linehaul + trailer over 1 is refused with the sum sentence", () => {
  assert.equal(
    validateSettlementSplit({ ...ok, linehaul_pct: 0.65, trailer_pct: 0.4 }).errors[0],
    "linehaul_pct (0.65) + trailer_pct (0.4) add to more than 1 — the carrier and the trailer can't take more than 100% of the linehaul",
  );
  assert.deepEqual(validateSettlementSplit({ ...ok, linehaul_pct: 0.92, trailer_pct: 0.08 }).errors, []);
});
test("a patch judges the sum against the stored row", () => {
  assert.match(validateSettlementSplit({ trailer_pct: 0.4 }, { partial: true, current: ok }).errors[0], /add to more than 1/);
  assert.deepEqual(validateSettlementSplit({ trailer_pct: 0.2 }, { partial: true, current: ok }).errors, []);
  assert.deepEqual(validateSettlementSplit({ trailer_pct: 0.4 }, { partial: true }).errors, []); // other half unknown
});
test("note is trimmed, null when blank, capped at 200", () => {
  assert.equal(validateSettlementSplit({ ...ok, note: "  hi " }).values.note, "hi");
  assert.equal(validateSettlementSplit({ ...ok, note: "   " }).values.note, null);
  assert.equal(validateSettlementSplit({ ...ok, note: "x".repeat(201) }).errors[0], "note is longer than 200 characters");
  assert.deepEqual(validateSettlementSplit({ ...ok, note: "x".repeat(200) }).errors, []);
});
test("partial only judges what is sent", () => {
  assert.deepEqual(validateSettlementSplit({}, { partial: true }), { values: {}, errors: [] });
  assert.deepEqual(validateSettlementSplit({ note: "typo fix" }, { partial: true }), { values: { note: "typo fix" }, errors: [] });
  assert.equal(validateSettlementSplit({ linehaul_pct: "" }, { partial: true }).errors[0], pctSentence("linehaul_pct"));
  assert.match(validateSettlementSplit({ effective_from: "nope" }, { partial: true }).errors[0], /calendar day/);
});
