import { isValidType, isDateValid } from "../helper.js";

/**
 * Fields to validate:
 * load_number, origin, destination,
 * pickup_date, delivery_date, load_status,
 * linehaul, fuel_surcharge, loaded_miles,
 * payment_status
 */

const rules = {
  load_number: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("load_number must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length > 20) {
      errors.push("load_number cannot be greater than 20 chars");
    }

    if (trimmed.length === 0) {
      errors.push("load_number cannot be blank");
    }
  },
  origin: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("origin must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("origin cannot be blank");
    }
  },
  destination: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("destination must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("destination cannot be blank");
    }
  },
  pickup_date: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("pickup_date must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("pickup_date cannot be blank");
    }

    if (trimmed.length !== 10) {
      // valid date format xxxx-xx-xx
      errors.push("pickup_date must be 10 chars long (xxxx-xx-xx)");
    }

    // Validate date
    const date = isDateValid(trimmed);
    if (!date) {
      errors.push(`${value} is an invalid date`);
    }
  },
  delivery_date: (value, errors) => {
    if (value === undefined) return;

    if (!isValidType("string", value)) {
      errors.push("delivery_date must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("delivery_date cannot be blank");
    }

    if (trimmed.length !== 10) {
      // valid date format xxxx-xx-xx
      errors.push("delivery_date must be 10 chars long (xxxx-xx-xx)");
    }

    // Validate date
    const date = isDateValid(trimmed);
    if (!date) {
      errors.push(`${value} is an invalid date`);
    }
  },
  load_status: (value, errors) => {
    const allowedStatusValues = [
      "booked",
      "in_transit",
      "delivered",
      "cancelled",
      "tonu",
    ];

    if (!isValidType("string", value)) {
      errors.push("load_status must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("load_status cannot be blank");
    }

    if (!allowedStatusValues.includes(trimmed)) {
      errors.push(`${value} is not an allowed load_status type`);
    }
  },
  linehaul: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("linehaul must be a number");
      return;
    }

    if (value <= 0) {
      errors.push("linehaul must be greater than 0");
    }
  },
  fuel_surcharge: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("fuel_surcharge must be a number");
      return;
    }

    if (value < 0) {
      errors.push("fuel_surcharge must be greater than or equal to 0");
    }
  },
  loaded_miles: (value, errors) => {
    if (!isValidType("integer", value)) {
      errors.push("loaded_miles must be an integer");
      return;
    }

    if (value <= 0) {
      errors.push("loaded_miles has to be greater than 0");
    }

    if (value > 10000) {
      errors.push("loaded_miles cannot be greater than 10000");
    }
  },
  payment_status: (value, errors) => {
    const paymentStatusValues = ["unpaid", "invoiced", "paid"];

    if (!isValidType("string", value)) {
      errors.push("payment_status must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("payment_status cannot be blank");
    }

    if (!paymentStatusValues.includes(trimmed)) {
      errors.push(`${value} is not a valid payment_status value`);
    }
  },
};

// ---- CREATE LOAD VALIDATION ----
export const validateLoadCreate = (data) => {
  const errors = [];

  // Check for mandatory fields
  if (data.load_number === undefined) errors.push("Missing load_number");
  if (data.origin === undefined) errors.push("Missing origin");
  if (data.destination === undefined) errors.push("Missing destination");
  if (data.pickup_date === undefined) errors.push("Missing pickup_date");
  if (data.load_status === undefined) errors.push("Missing load_status");
  if (data.linehaul === undefined) errors.push("Missing linehaul");
  if (data.fuel_surcharge === undefined) errors.push("Missing fuel_surcharge");
  if (data.loaded_miles === undefined) errors.push("Missing loaded_miles");
  if (data.payment_status === undefined) errors.push("Missing payment_status");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH LOAD VALIDATION ----
export const validateLoadPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
