import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateTripCreate,
  validateTripPatch,
} from "./tripsValidation.js";

// A minimal valid create payload; individual tests override the location fields.
const base = { trip_date: "2026-07-24", trip_purpose: "home" };

describe("trip location validation", () => {
  test("accepts a full start + end city/state", () => {
    const errors = validateTripCreate({
      ...base,
      start_city: "Irving",
      start_state: "TX",
      end_city: "Laredo",
      end_state: "TX",
    });
    assert.deepEqual(errors, []);
  });

  test("location is optional — a bare trip passes", () => {
    assert.deepEqual(validateTripCreate(base), []);
  });

  test("null/undefined location fields are skipped, not errors", () => {
    const errors = validateTripCreate({
      ...base,
      start_city: null,
      end_state: undefined,
    });
    assert.deepEqual(errors, []);
  });

  test("rejects a state that isn't 2 letters", () => {
    const errors = validateTripCreate({ ...base, end_state: "Texas" });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /end_state must be a 2-letter state code/);
  });

  test("rejects a city longer than 50 characters", () => {
    const errors = validateTripCreate({ ...base, start_city: "x".repeat(51) });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /start_city must be 50 characters or fewer/);
  });

  test("rejects a non-string city", () => {
    const errors = validateTripCreate({ ...base, start_city: 123 });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /start_city must be a string/);
  });

  test("patch validates location the same way", () => {
    assert.deepEqual(validateTripPatch({ end_city: "Dallas", end_state: "TX" }), []);
    assert.match(
      validateTripPatch({ start_state: "T" })[0],
      /start_state must be a 2-letter state code/,
    );
  });
});
