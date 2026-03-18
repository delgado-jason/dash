import { isValidType } from "../helper.js";

/**
 * Fields to validate:
 * accessorial_type, amount
 */

const rules = {
  accessorial_type: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("accessorial_type must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("accessorial_type cannot be blank");
    }
  },
  amount: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("amount must be a number");
      return;
    }

    if (value <= 0) {
      errors.push("amount must be greater than 0");
    }
  },
};

// ---- CREATE ACCESSORIAL VALIDATION ----
export const validateAccessorialCreate = (data) => {
  const errors = [];

  // Check for mandatory fields
  if (data.accessorial_type === undefined)
    errors.push("Missing accessorial_type");
  if (data.amount === undefined) errors.push("Missing amount");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH ACCESSORIAL VALIDATION ----
export const validateAccessorialPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
