import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateObligation } from "./obligationValidation.js";

const ok = { amount: 1250, day_of_month: 15 };

describe("validateObligation — create", () => {
  test("a plain bill passes and normalizes", () => {
    const { values, errors } = validateObligation({ amount: "1250.50", day_of_month: "15", draft_amount: "", payoff_date: "2029-06-15" });
    assert.deepEqual(errors, []);
    assert.equal(values.amount, 1250.5);
    assert.equal(values.day_of_month, 15);
    assert.equal(values.draft_amount, null);
    assert.equal(values.payoff_date, "2029-06-15");
  });
  test("amount must be finite and non-negative", () => {
    assert.match(validateObligation({ ...ok, amount: "abc" }).errors[0], /amount needs a number/);
    assert.match(validateObligation({ ...ok, amount: null }).errors[0], /amount needs a number/);
    assert.match(validateObligation({ ...ok, amount: -1 }).errors[0], /amount can't be negative/);
    assert.deepEqual(validateObligation({ ...ok, amount: 0 }).errors, []);
  });
  test("an active bill needs a day 1–31", () => {
    const msg = /an active bill needs its draft day \(1–31\) or the money calendar can't place it/;
    assert.match(validateObligation({ amount: 5 }).errors[0], msg);
    assert.match(validateObligation({ amount: 5, day_of_month: null }).errors[0], msg);
    assert.match(validateObligation({ amount: 5, day_of_month: 0 }).errors[0], /day_of_month must be a whole day/);
    assert.match(validateObligation({ amount: 5, day_of_month: 32 }).errors[0], /day_of_month must be a whole day/);
    assert.match(validateObligation({ amount: 5, day_of_month: 1.5 }).errors[0], /day_of_month must be a whole day/);
    assert.deepEqual(validateObligation({ amount: 5, day_of_month: 31 }).errors, []);
  });
  test("balances and draft amount: null or ≥ 0", () => {
    for (const f of ["draft_amount", "original_balance", "current_balance"]) {
      assert.match(validateObligation({ ...ok, [f]: -1 }).errors[0], new RegExp(`${f} can't be negative`));
      assert.match(validateObligation({ ...ok, [f]: "abc" }).errors[0], new RegExp(`${f} must be a number`));
      assert.equal(validateObligation({ ...ok, [f]: null }).values[f], null);
    }
  });
  test("dates are real YYYY-MM-DD or null", () => {
    assert.match(validateObligation({ ...ok, balance_as_of: "10/31/2026" }).errors[0], /balance_as_of must be a real YYYY-MM-DD/);
    assert.match(validateObligation({ ...ok, payoff_date: "2026-02-30" }).errors[0], /payoff_date must be a real YYYY-MM-DD/);
    assert.equal(validateObligation({ ...ok, payoff_date: "" }).values.payoff_date, null);
  });
  test("a draw is never an operating cost", () => {
    assert.match(validateObligation({ ...ok, is_draw: true, on_pl: true }).errors[0], /a draw is never an operating cost — it can't also be on the P&L/);
    assert.deepEqual(validateObligation({ ...ok, is_draw: true, on_pl: false }).errors, []);
  });
});

describe("validateObligation — partial (patch)", () => {
  const existing = { active: true, is_draw: false, on_pl: false, day_of_month: 15 };
  const patch = (data, ex = existing) => validateObligation(data, { partial: true, existing: ex });
  test("only the fields present are judged and returned", () => {
    assert.deepEqual(patch({ amount: 99 }), { values: { amount: 99 }, errors: [] });
    assert.deepEqual(patch({}), { values: {}, errors: [] });
  });
  test("amount on a patch is still checked", () => {
    assert.match(patch({ amount: "abc" }).errors[0], /amount needs a number/);
  });
  test("clearing the day of an active bill is refused; of an inactive one is fine", () => {
    assert.match(patch({ day_of_month: null }).errors[0], /an active bill needs its draft day/);
    assert.deepEqual(patch({ day_of_month: null }, { ...existing, active: false }).errors, []);
  });
  test("re-activating a bill that has no day is refused", () => {
    const stored = { active: false, is_draw: false, on_pl: false, day_of_month: null };
    assert.match(patch({ active: true }, stored).errors[0], /an active bill needs its draft day/);
    assert.deepEqual(patch({ active: true, day_of_month: 3 }, stored).errors, []);
  });
  test("is_draw on a stored on_pl bill is refused on the merge", () => {
    assert.match(patch({ is_draw: true }, { ...existing, on_pl: true }).errors[0], /a draw is never an operating cost/);
  });
  test("without the stored row a patch is judged on what it carries", () => {
    assert.deepEqual(validateObligation({ amount: 5 }, { partial: true }).errors, []);
    assert.match(validateObligation({ active: true, day_of_month: null }, { partial: true }).errors[0], /an active bill needs/);
  });
});
