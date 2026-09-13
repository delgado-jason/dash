import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAINTENANCE_UNITS,
  SERVICE_UNITS,
  isUnit,
  isServiceUnit,
  READING_FIELD,
  MAX_APU_HOURS,
  apuHoursErrors,
} from "./maintenanceValidation.js";
import {
  validateFuelEntryCreate,
  validateFuelEntryPatch,
} from "./fuelValidation.js";

describe("unit vocabularies — the APU is a fourth unit (078)", () => {
  test("a schedule item is tractor, trailer or apu — never 'both'", () => {
    assert.deepEqual(MAINTENANCE_UNITS, ["tractor", "trailer", "apu"]);
    for (const u of MAINTENANCE_UNITS) assert.equal(isUnit(u), true, u);
    // 'both' is a SERVICE word: one visit, two units. An item has one meter.
    for (const bad of ["both", "truck", "APU", "", null, undefined, 4])
      assert.equal(isUnit(bad), false, String(bad));
  });

  test("a service is tractor, trailer, both or apu", () => {
    assert.deepEqual(SERVICE_UNITS, ["tractor", "trailer", "both", "apu"]);
    for (const u of SERVICE_UNITS) assert.equal(isServiceUnit(u), true, u);
    for (const bad of ["engine", "Both", "", null, undefined, {}])
      assert.equal(isServiceUnit(bad), false, String(bad));
  });

  test("each unit reads its own meter", () => {
    assert.equal(READING_FIELD.tractor, "odometer");
    assert.equal(READING_FIELD.trailer, "trailer_hub");
    assert.equal(READING_FIELD.apu, "apu_hours");
    // 'both' has no single meter — the caller reads per completed item.
    assert.equal(READING_FIELD.both, undefined);
  });
});

describe("apuHoursErrors — a meter reading, or nothing", () => {
  test("absent and null are fine: nobody wrote the hours down", () => {
    assert.deepEqual(apuHoursErrors(undefined), []);
    assert.deepEqual(apuHoursErrors(null), []);
  });

  test("a real reading passes, including a fresh unit at 0", () => {
    assert.deepEqual(apuHoursErrors(0), []);
    assert.deepEqual(apuHoursErrors(1240), []);
    assert.deepEqual(apuHoursErrors(MAX_APU_HOURS), []);
  });

  test("hours are whole — a meter has no decimals", () => {
    assert.deepEqual(apuHoursErrors(1240.5), ["apu_hours must be a whole number"]);
    assert.deepEqual(apuHoursErrors("1240"), ["apu_hours must be a whole number"]);
    assert.deepEqual(apuHoursErrors(NaN), ["apu_hours must be a whole number"]);
  });

  test("negative and absurd readings are refused", () => {
    assert.deepEqual(apuHoursErrors(-1), ["apu_hours cannot be negative"]);
    assert.deepEqual(apuHoursErrors(MAX_APU_HOURS + 1), [
      "apu_hours cannot be more than 100,000",
    ]);
  });

  test("the field name travels, so an item's error names its own column", () => {
    assert.deepEqual(apuHoursErrors(-5, "last_done_hours"), [
      "last_done_hours cannot be negative",
    ]);
  });
});

describe("fuel entries carry an optional apu_hours", () => {
  const good = {
    fuel_date: "2026-09-03",
    gallons: 137.8,
    price_per_gallon: 4.033,
    odometer_reading: 568737,
    fuel_state: "PA",
  };

  test("a fill-up with no reading is still valid", () => {
    assert.deepEqual(validateFuelEntryCreate(good), []);
    assert.deepEqual(validateFuelEntryCreate({ ...good, apu_hours: null }), []);
  });

  test("a fill-up that carries a reading is valid", () => {
    assert.deepEqual(validateFuelEntryCreate({ ...good, apu_hours: 1240 }), []);
    assert.deepEqual(validateFuelEntryPatch({ apu_hours: 1240 }), []);
  });

  test("a bad reading is refused on create and on patch", () => {
    assert.deepEqual(validateFuelEntryCreate({ ...good, apu_hours: -2 }), [
      "apu_hours cannot be negative",
    ]);
    assert.deepEqual(validateFuelEntryPatch({ apu_hours: 12.5 }), [
      "apu_hours must be a whole number",
    ]);
  });
});
