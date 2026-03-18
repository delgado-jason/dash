import { isValidType, isDateValid } from "../helper.js";

/**
 * Fields to validate:
 * fuel_date, gallons, price_per_gallon,
 * odometer_reading, company_name,
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
export const validateFuelEntryCreate = (data) => {
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

  return errors;
};

// ---- PATCH FUEL ENTRY VALIDATION ----
export const validateFuelEntryPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
