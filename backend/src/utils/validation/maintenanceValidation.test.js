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
  reconcileBothReading,
  BOTH_ONE_READING_ERROR,
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

describe("GL-07 — a both service carries one reading", () => {
  test("an odometer alone fills the trailer's meter", () => {
    const r = reconcileBothReading({ unit: "both", odometer: 600000 });
    assert.equal(r.trailer_hub, 600000);
    assert.deepEqual(r.errors, []);
  });
  test("two equal readings pass; two different ones are refused with the sentence", () => {
    assert.deepEqual(reconcileBothReading({ unit: "both", odometer: 600000, trailer_hub: 600000 }).errors, []);
    assert.deepEqual(reconcileBothReading({ unit: "both", odometer: 600000, trailer_hub: 456123 }).errors, [BOTH_ONE_READING_ERROR]);
  });
  test("no odometer stays blank — never a zero", () => {
    const r = reconcileBothReading({ unit: "both" });
    assert.equal(r.odometer, null);
    assert.equal(r.trailer_hub, null);
  });
  test("a trailer service keeps its own trailer_hub; tractor and apu are untouched", () => {
    assert.deepEqual(reconcileBothReading({ unit: "trailer", odometer: 5, trailer_hub: 9 }), { odometer: 5, trailer_hub: 9, errors: [] });
    assert.deepEqual(reconcileBothReading({ unit: "tractor", odometer: 5 }), { odometer: 5, trailer_hub: null, errors: [] });
    assert.deepEqual(reconcileBothReading({ unit: "apu", apu_hours: 3 }).errors, []);
  });
});

import { apuReadingSanity, MAX_APU_HOURS_PER_DAY } from "./maintenanceValidation.js";

describe("apuReadingSanity — a reading no meter could produce is refused, and the pair is named", () => {
  // Self-consistent neighbours: 87 hours over six days, 255 over eighteen.
  const onFile = [
    { day: "2026-09-13", hours: 13413 },
    { day: "2026-09-19", hours: 13500 },
    { day: "2026-10-07", hours: 13755 },
  ];
  test("Jason's Sep 14 reading: 127 hours above the day before", () => {
    const e = apuReadingSanity({ day: "2026-09-14", hours: 13540 }, onFile);
    assert.ok(e.length >= 1);
    assert.match(e[0], /13,540 on 2026-09-14 is 127 hours above 13,413 on 2026-09-13/);
    assert.match(e[0], new RegExp(`more than ${MAX_APU_HOURS_PER_DAY} hours a day`));
  });
  test("a plausible reading between its neighbours passes", () => {
    assert.deepEqual(apuReadingSanity({ day: "2026-09-16", hours: 13450 }, onFile), []);
  });
  test("a meter that goes backwards is refused, against either neighbour", () => {
    assert.match(apuReadingSanity({ day: "2026-09-20", hours: 13490 }, onFile)[0], /below 13,500 on 2026-09-19 — a meter cannot go backwards/);
    assert.match(apuReadingSanity({ day: "2026-09-10", hours: 13600 }, onFile)[0], /above 13,413 on 2026-09-13 — a meter cannot go backwards/);
  });
  test("a jump is judged against the LATER reading too", () => {
    // 13,600 on Oct 6 would need 155 hours by Oct 7
    const e = apuReadingSanity({ day: "2026-10-06", hours: 13600 }, onFile);
    assert.equal(e.length, 1);
    assert.match(e[0], /155 hours below 13,755 on 2026-10-07/);
  });
  test("two readings on one day may differ by a day's hours, not more", () => {
    assert.deepEqual(apuReadingSanity({ day: "2026-09-19", hours: 13510 }, onFile), []);
    const e = apuReadingSanity({ day: "2026-09-19", hours: 13530 }, onFile);
    assert.equal(e.length, 1);
    assert.match(e[0], /read the same day by 30 hours/);
  });
  test("the first reading ever, or a blank one, is never refused", () => {
    assert.deepEqual(apuReadingSanity({ day: "2026-09-13", hours: 13413 }, []), []);
    assert.deepEqual(apuReadingSanity({ day: "2026-09-13", hours: null }, onFile), []);
    assert.deepEqual(apuReadingSanity(null, onFile), []);
  });
});
