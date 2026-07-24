import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateDateOrder,
  validateLoadPatch,
} from "./loadValidation.js";

const errsFor = (pickup, delivery) => {
  const errors = [];
  validateDateOrder(pickup, delivery, errors);
  return errors;
};

describe("validateDateOrder", () => {
  test("rejects a delivery date earlier than the pickup date", () => {
    // The exact shape of the bug: Jul 14 delivery on a Jul 21 pickup.
    const errors = errsFor("2026-07-21", "2026-07-14");
    assert.equal(errors.length, 1);
    assert.match(errors[0], /delivery_date .* cannot be earlier/);
  });

  test("allows same-day delivery", () => {
    assert.deepEqual(errsFor("2026-07-21", "2026-07-21"), []);
  });

  test("allows a later delivery, including across a year boundary", () => {
    assert.deepEqual(errsFor("2026-07-21", "2026-07-22"), []);
    assert.deepEqual(errsFor("2026-12-31", "2027-01-02"), []);
  });

  test("stays quiet when either date is absent — a booked load hasn't delivered", () => {
    assert.deepEqual(errsFor("2026-07-21", null), []);
    assert.deepEqual(errsFor("2026-07-21", undefined), []);
    assert.deepEqual(errsFor(null, "2026-07-14"), []);
  });

  test("tolerates timestamps and whitespace by comparing the date part", () => {
    assert.deepEqual(errsFor("2026-07-21T00:00:00Z", "2026-07-22T00:00:00Z"), []);
    assert.equal(errsFor(" 2026-07-21 ", " 2026-07-14 ").length, 1);
  });

  test("defers to the per-field shape rules on a malformed date", () => {
    assert.deepEqual(errsFor("nope", "2026-07-14"), []);
  });
});

describe("validateLoadPatch date order", () => {
  const stored = { pickup_date: "2026-07-21", delivery_date: "2026-07-25" };

  test("catches moving delivery before the STORED pickup date", () => {
    const errors = validateLoadPatch({ delivery_date: "2026-07-14" }, stored);
    assert.ok(errors.some((e) => /cannot be earlier/.test(e)));
  });

  test("catches moving pickup after the STORED delivery date", () => {
    const errors = validateLoadPatch({ pickup_date: "2026-07-30" }, stored);
    assert.ok(errors.some((e) => /cannot be earlier/.test(e)));
  });

  test("allows a valid single-field move", () => {
    assert.deepEqual(validateLoadPatch({ delivery_date: "2026-07-22" }, stored), []);
  });

  test("allows both dates moved together", () => {
    const errors = validateLoadPatch(
      { pickup_date: "2026-08-01", delivery_date: "2026-08-03" },
      stored,
    );
    assert.deepEqual(errors, []);
  });

  test("ignores date order on a patch that touches neither date", () => {
    assert.deepEqual(validateLoadPatch({ loaded_miles: 900 }, stored), []);
  });
});
