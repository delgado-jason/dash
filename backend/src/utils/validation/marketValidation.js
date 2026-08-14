import { isValidType } from "../helper.js";

// Canonicalize a market name before it is stored so the same market can't sneak
// in under cosmetic variations. Trims ends, collapses internal whitespace runs,
// and appends "Market" when the name doesn't already END in it (the "[City]
// Market" convention is a trailing token, so anchor to the end — otherwise
// "Newmarket" would become "Newmarket Market"). Non-strings pass through
// untouched so the type check in the rules can still flag them.
export const normalizeMarketName = (value) => {
  if (typeof value !== "string") return value;
  const collapsed = value.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) return collapsed;
  return /market$/i.test(collapsed) ? collapsed : `${collapsed} Market`;
};

// market_name is varchar(50) in the DB.
const MARKET_NAME_MAX = 50;

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
      return;
    }

    if (trimmed.length > MARKET_NAME_MAX) {
      errors.push(`market_name must be ${MARKET_NAME_MAX} characters or fewer`);
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
