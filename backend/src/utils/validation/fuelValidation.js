import { isValidType, isDateValid } from "../helper.js";
import { apuHoursErrors } from "./maintenanceValidation.js";
import { monthDay } from "./moneyFields.js";

// ODO-05 · how far below an earlier-dated fill a reading may sit before it is
// refused as a typo (a rolled-back or mistyped odometer).
export const BACKWARDS_TOLERANCE_MI = 1000;

const DAY_MS = 86_400_000;
const utcKey = (d) => d.toISOString().slice(0, 10);
// The far edge of today: UTC-today + 1 (Railway runs UTC, the business is
// Central) — a full day of slack, and still refuses a mis-picked month.
const tomorrowKey = (now) => utcKey(new Date(Date.parse(utcKey(now) + "T00:00:00Z") + DAY_MS));

// The clock and the odometer sequence, which the per-field rules cannot see.
//   fuel_date        not in the future
//   odometer_reading not more than 1,000 mi below the earlier-dated fill
// `previous` is {fuel_date, odometer_reading} of the truck's latest fill dated
// before this one (null when there is none). Either argument may be absent on
// a patch that touches only the other.
export const validateFuelSequence = ({ fuel_date, odometer_reading, previous = null } = {}, now = new Date()) => {
  const errors = [];
  const dateOk = typeof fuel_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fuel_date.trim()) && !Number.isNaN(Date.parse(fuel_date.trim()));
  if (dateOk && fuel_date.trim() > tomorrowKey(now))
    errors.push("fuel_date can't be in the future");
  if (
    previous &&
    Number.isInteger(odometer_reading) &&
    Number.isFinite(Number(previous.odometer_reading)) &&
    (!dateOk || String(previous.fuel_date).slice(0, 10) <= fuel_date.trim())
  ) {
    const below = Number(previous.odometer_reading) - odometer_reading;
    if (below > BACKWARDS_TOLERANCE_MI)
      errors.push(
        `this reading is ${below.toLocaleString("en-US")} mi below the ${monthDay(previous.fuel_date)} fill — check the odometer`,
      );
  }
  return errors;
};

/**
 * Fields to validate:
 * fuel_date, gallons, price_per_gallon,
 * odometer_reading, apu_hours, company_name,
 * fuel_city, fuel_state
 */

const rules = {
  fuel_date: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("fuel_date must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("fuel_date cannot be blank");
    }

    if (trimmed.length !== 10) {
      errors.push("fuel_date must be 10 chars (yyyy-mm-dd)");
    }

    if (!isDateValid(trimmed)) {
      errors.push("Invalid date for fuel_date");
    }
  },
  gallons: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("gallons must be a number");
      return;
    }

    if (value < 1) {
      errors.push("gallons cannot be less than 1");
    }

    if (value > 400) {
      errors.push("gallons cannot be more than 400");
    }
  },
  price_per_gallon: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("price_per_gallon must be a number");
      return;
    }

    if (value <= 0) {
      errors.push("price_per_gallon must be greater than 0");
    }

    if (value > 10) {
      errors.push("price_per_gallon cannot be more than 10");
    }
  },
  odometer_reading: (value, errors) => {
    if (!isValidType("integer", value)) {
      errors.push("odometer_reading must be an Integer");
      return;
    }

    if (value < 1) {
      errors.push("odometer_reading cannot be less than 1");
    }

    if (value > 5000000) {
      errors.push("odometer_reading cannot be greater than 5 million");
    }
  },
  // The APU's hour meter, optionally read at the pump — the cheap capture that
  // re-anchors the APU schedule. null/absent means "not read", never zero.
  apu_hours: (value, errors) => {
    if (value === undefined || value === null) return;

    for (const e of apuHoursErrors(value)) errors.push(e);
  },
  company_name: (value, errors) => {
    if (value === undefined) return;

    if (!isValidType("string", value)) {
      errors.push("company_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length > 100) {
      errors.push("company name cannot be more than 100 chars");
    }
  },
  fuel_city: (value, errors) => {
    if (value === undefined) return;

    if (!isValidType("string", value)) {
      errors.push("fuel_city must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length > 50) {
      errors.push("fuel_city name cannot be more than 50 chars");
    }
  },
  fuel_state: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("fuel_state must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("fuel_state cannot be blank");
    }

    if (trimmed.length !== 2) {
      errors.push("fuel_state must be 2 chars (AL, TX, GA)");
    }
  },
};

// ---- CREATE FUEL ENTRY VALIDATION ----
export const validateFuelEntryCreate = (data, { previous = null, now = new Date() } = {}) => {
  const errors = [];

  // Check for mandatory fields
  if (data.fuel_date === undefined) errors.push("Missing fuel_date");
  if (data.gallons === undefined) errors.push("Missing gallons");
  if (data.price_per_gallon === undefined)
    errors.push("Missing price_per_gallon");
  if (data.odometer_reading === undefined)
    errors.push("Missing odometer_reading");
  if (data.fuel_state === undefined) errors.push("Missing fuel_state");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  if (errors.length === 0)
    errors.push(...validateFuelSequence({ ...data, previous }, now));

  return errors;
};

// ---- PATCH FUEL ENTRY VALIDATION ----
// `existing` is the stored row {fuel_date, odometer_reading}: a patch may move
// only one of the two, so the sequence check merges the incoming over it.
export const validateFuelEntryPatch = (data, { previous = null, existing = null, now = new Date() } = {}) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  if (
    errors.length === 0 &&
    (data.fuel_date !== undefined || data.odometer_reading !== undefined)
  ) {
    const ex = existing ?? {};
    errors.push(
      ...validateFuelSequence(
        {
          fuel_date: data.fuel_date ?? ex.fuel_date,
          odometer_reading: data.odometer_reading ?? ex.odometer_reading,
          previous,
        },
        now,
      ),
    );
  }

  return errors;
};
