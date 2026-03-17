/**
 * Fields to validate:
 * stop_order, stop_type, stop_city, stop_state,
 * scheduled_date
 */

const rules = {
  stop_order: (value, errors) => {
    if (!Number.isInteger(value)) {
      errors.push("stop_order must be an Integer");
      return;
    }

    if (value < 1) {
      errors.push("stop_order must be greater than 0");
    }
  },
  stop_type: (value, errors) => {
    const validStopTypes = ["pickup", "delivery"];

    if (typeof value !== "string") {
      errors.push("stop_type must be a string");
      return;
    }

    if (!validStopTypes.includes(value)) {
      errors.push(
        `stop_type does not recognize "${value}" as a valid stop_type`,
      );
    }
  },
  stop_city: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("stop_city must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length > 50) {
      errors.push("stop_city cannot be more than 50 characters");
    }

    if (trimmed.length === 0) {
      errors.push("stop_city cannot be blank");
    }
  },
  stop_state: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("stop_state must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("stop_state cannot be blank");
    }

    if (trimmed.length !== 2) {
      errors.push("stop_state must be 2 characters only");
    }
  },
  scheduled_date: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("scheduled_date must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("scheduled_date cannot be blank");
    }

    if (trimmed.length !== 10) {
      errors.push("scheduled_date must be in (xxxx-xx-xx) format");
    }
  },
};

// ---- CREATE TRIP STOP VALIDATION ----
export const validateTripStopCreate = (data) => {
  const errors = [];

  // Check for mandatory fields
  if (data.stop_order === undefined) errors.push("Missing stop_order");
  if (data.stop_type === undefined) errors.push("Missing stop_type");
  if (data.stop_city === undefined) errors.push("Missing stop_city");
  if (data.stop_state === undefined) errors.push("Missing stop_state");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH TRIP STOP VALIDATION ----
export const validateTripStopPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
