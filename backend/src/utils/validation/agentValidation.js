import { isValidType, isValidUUID } from "../helper.js";

//** Rules for allowed fields
// broker_id,
// first_name,
// last_name,
// phone,
// email,
// preferred_contact,
// rating,
// notes */

const rules = {
  broker_id: (value, errors) => {
    if (!isValidUUID(value)) {
      errors.push("not a valid UUID");
    }
  },
  first_name: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("first_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("first_name cannot be blank");
    }
  },
  last_name: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("last_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("last_name cannot be blank");
    }
  },
  phone: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("phone must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("phone cannot be blank");
    }
  },
  email: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("email must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("email cannot be blank");
    }

    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      errors.push("not a valid email");
    }
  },
  preferred_contact: (value, errors) => {
    if (!value) return;

    const methods = ["phone", "email", "text"];

    if (!isValidType("string", value)) {
      errors.push("preferred_contact must be a string");
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("preferred_contact cannot be blank");
    }

    if (!methods.includes(trimmed)) {
      errors.push("not a valid method");
    }
  },
  rating: (value, errors) => {
    if (!value) return;

    if (!isValidType("integer", value)) {
      errors.push("rating must be an integer");
      return;
    }

    if (value < 1 || value > 5) {
      errors.push("rating must be between 1 and 5");
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

// ---- CREATE AGENT VALIDATION ----
export const validateAgentCreate = (data) => {
  const errors = [];

  if (!data.broker_id) errors.push("Missing broker_id");
  if (!data.first_name) errors.push("Missing first_name");
  if (!data.last_name) errors.push("Missing last_name");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH AGENT VALIDATION ----
export const validateAgentPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
