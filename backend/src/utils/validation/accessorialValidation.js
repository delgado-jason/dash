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

// NET-05 · an accessorial type with no accessorial_pay_rates row is ACCEPTED,
// but paid at the schedule's accessorial_pct fallback — say so. Pure: returns
// the sentence, or null when the type has its own rate.
//   rated          true when accessorial_pay_rates has a row for the type
//   accessorial_pct the schedule's fallback fraction (0.73 → "73%")
export const accessorialRateWarning = (accessorial_type, rated, accessorial_pct) => {
  if (rated) return null;
  const pct = Math.round(Number(accessorial_pct) * 10000) / 100;
  if (!Number.isFinite(pct)) return null;
  return `${accessorial_type} has no pay rate — it is paid at the ${pct}% fallback; set it in Settings`;
};
