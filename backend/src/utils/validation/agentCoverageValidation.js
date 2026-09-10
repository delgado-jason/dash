import { isValidType } from "../helper.js";

/**
 * Fields to validate:
 * agent_id, city, state, shipper_name, notes
 *
 * city/state arrive canonical from CityAutocomplete (HERE-backed), so these
 * rules are a backstop against a hand-rolled request, not the primary defense.
 */

const SOURCES = ["stated", "confirmed"];

const rules = {
  agent_id: (value, errors) => {
    if (!isValidType("string", value) || value.trim().length === 0) {
      errors.push("agent_id is required");
    }
  },

  city: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("city must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("city cannot be blank");
    }

    if (trimmed.length > 100) {
      errors.push("city cannot be more than 100 characters");
    }
  },

  state: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("state must be a string");
      return;
    }

    // Canonical two-letter code — anything else would never key against
    // city_coords, so the Foreman could not place it.
    if (!/^[A-Za-z]{2}$/.test(value.trim())) {
      errors.push("state must be a 2-letter code");
    }
  },

  shipper_name: (value, errors) => {
    // NULL is the normal case — an agent names a market, not a customer.
    if (value === null) return;

    if (!isValidType("string", value)) {
      errors.push("shipper_name must be a string");
      return;
    }

    if (value.trim().length > 120) {
      errors.push("shipper_name cannot be more than 120 characters");
    }
  },

  source: (value, errors) => {
    if (!SOURCES.includes(value)) {
      errors.push(`source must be one of: ${SOURCES.join(", ")}`);
    }
  },

  notes: (value, errors) => {
    if (value === null) return;

    if (!isValidType("string", value)) {
      errors.push("notes must be a string");
    }
  },
};

// ---- CREATE AGENT COVERAGE VALIDATION ----
export const validateAgentCoverageCreate = (data) => {
  const errors = [];

  // Required regardless of whether the caller sent them.
  for (const field of ["agent_id", "city", "state"]) {
    if (data[field] === undefined) errors.push(`${field} is required`);
  }

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
