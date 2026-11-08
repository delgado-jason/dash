import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateFuelEntryCreate, validateFuelEntryPatch, validateFuelSequence, BACKWARDS_TOLERANCE_MI } from "./fuelValidation.js";

const NOW = new Date("2026-11-04T20:00:00Z");
const fill = (over = {}) => ({ fuel_date: "2026-11-03", gallons: 100, price_per_gallon: 3.5, odometer_reading: 600000, fuel_state: "TX", ...over });

describe("fuel_date — never in the future", () => {
  test("today and yesterday pass; UTC-tomorrow is a Central evening", () => {
    assert.deepEqual(validateFuelEntryCreate(fill({ fuel_date: "2026-11-04" }), { now: NOW }), []);
    assert.deepEqual(validateFuelEntryCreate(fill({ fuel_date: "2026-11-05" }), { now: NOW }), []);
  });
  test("a future date is refused", () => {
    assert.deepEqual(validateFuelEntryCreate(fill({ fuel_date: "2026-11-20" }), { now: NOW }), ["fuel_date can't be in the future"]);
    assert.deepEqual(validateFuelEntryPatch({ fuel_date: "2027-01-01" }, { now: NOW }), ["fuel_date can't be in the future"]);
  });
});

describe("odometer_reading — against the earlier-dated fill", () => {
  const previous = { fuel_date: "2026-10-30", odometer_reading: 601240 };
  test("tolerance is 1,000 mi", () => assert.equal(BACKWARDS_TOLERANCE_MI, 1000));
  test("more than 1,000 mi below is refused with the real numbers", () => {
    assert.deepEqual(validateFuelEntryCreate(fill({ odometer_reading: 600000 }), { previous, now: NOW }), [
      "this reading is 1,240 mi below the Oct 30 fill — check the odometer",
    ]);
  });
  test("exactly 1,000 below, a higher reading, and no previous fill all pass", () => {
    assert.deepEqual(validateFuelEntryCreate(fill({ odometer_reading: 600240 }), { previous, now: NOW }), []);
    assert.deepEqual(validateFuelEntryCreate(fill({ odometer_reading: 602000 }), { previous, now: NOW }), []);
    assert.deepEqual(validateFuelEntryCreate(fill({ odometer_reading: 5 }), { previous: null, now: NOW }), []);
  });
  test("a patch merges the incoming over the stored row", () => {
    const existing = { fuel_date: "2026-11-03", odometer_reading: 602000 };
    assert.deepEqual(validateFuelEntryPatch({ odometer_reading: 600000 }, { previous, existing, now: NOW }).length, 1);
    assert.deepEqual(validateFuelEntryPatch({ gallons: 90 }, { previous, existing, now: NOW }), []);
  });
  test("validateFuelSequence ignores a previous fill dated after this one", () => {
    assert.deepEqual(validateFuelSequence({ fuel_date: "2026-10-01", odometer_reading: 100, previous }, NOW), []);
  });
});
