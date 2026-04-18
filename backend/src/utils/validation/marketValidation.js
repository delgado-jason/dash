import { isValidType } from "../helper.js";

//** Rules for allowed fields
// market_name,
// notes */

const rules = {
  market_name: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("market_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("market_name cannot be blank");
    }
  },
  notes: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("notes must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("notes cannot be blank");
    }
  },
};

// ---- CREATE MARKET VALIDATION ----
export const validateMarketCreate = (data) => {
  const errors = [];

  if (!data.market_name) errors.push("Missing market_name");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH MARKET VALIDATION ----
export const validateMarketPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
