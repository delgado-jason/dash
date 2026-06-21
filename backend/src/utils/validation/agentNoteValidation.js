import { isValidType } from "../helper.js";

/**
 * Fields to validate:
 * note, created_by
 */

const rules = {
  note: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("note must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("note cannot be blank");
    }
  },

  created_by: (value, errrors) => {
    if (!isValidType("string", value)) {
      errors.push("created_by must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("created_by cannont be blank");
    }

    if (trimmed.length > 5) {
      errors.push("created_at cannot be more than 5 characters");
    }
  },
};

// ---- CREATE ACCESSORIAL VALIDATION ----
export const validateAgentNoteCreate = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
