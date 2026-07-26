/**
 * Fields to validate:
 * truck_id, driver_id (optional)
 * trip_type, trip_source, status (ENUMs)
 * trip_date, odometer_start, odometer_end, is_estimated
 */

// Location is optional; when present, a city is a short string and a state is a
// 2-letter code. null/undefined skip (the field just isn't set).
const cityRule = (field) => (value, errors) => {
  if (value == null) return;
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return;
  }
  if (value.length > 50) errors.push(`${field} must be 50 characters or fewer`);
};

const stateRule = (field) => (value, errors) => {
  if (value == null) return;
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return;
  }
  if (value.trim().length !== 2)
    errors.push(`${field} must be a 2-letter state code`);
};

const rules = {
  start_city: cityRule("start_city"),
  start_state: stateRule("start_state"),
  end_city: cityRule("end_city"),
  end_state: stateRule("end_state"),
  trip_date: (value, errors) => {
    // Check if date is a string
    if (typeof value !== "string") {
      errors.push("trip_date must be a string");
      return;
    }

    const trimmed = value.trim();

    // Check length of string 'xxxx-xx-xx' 10 chars
    if (trimmed.length !== 10) {
      errors.push("trip_date must be 10 characters long (xxxx-xx-xx)");
    }

    // Check if blank
    if (trimmed.length === 0) {
      errors.push("trip_date cannot be blank");
    }
  },
  trip_purpose: (value, errors) => {
    const validPurposes = ["repositioning", "home", "shop", "personal"];

    if (typeof value !== "string") {
      errors.push("trip_purpose must be a string");
      return;
    }

    if (!validPurposes.includes(value)) {
      errors.push(
        "trip_purpose must be one of: repositioning, home, shop, personal",
      );
    }
  },
  odometer_start: (value, errors) => {
    // Check if it's a integer
    if (!Number.isInteger(value)) {
      errors.push("odometer_start must be an integer");
      return;
    }

    // Has to be greater than 0
    if (value <= 0) {
      errors.push("odometer_start cannot be less than or equal to 0");
    }
  },
  odometer_end: (value, errors) => {
    // Check if it's a integer
    if (!Number.isInteger(value)) {
      errors.push("odometer_end must be an integer");
      return;
    }

    // Has to be greater than 0
    if (value <= 0) {
      errors.push("odometer_end cannot be less than or equal to 0");
    }
  },
};

// ---- CREATE TRIP VALIDATION ----
export const validateTripCreate = (data) => {
  const errors = [];

  if (!data.trip_date) {
    errors.push("Missing trip_date");
  }

  if (!data.trip_purpose) {
    errors.push("Missing trip_purpose");
  }

  // Cross-field: an odometer window must not run backwards (protects the
  // tiling invariant). Only checked when both readings are provided.
  if (
    data.odometer_start != null &&
    data.odometer_end != null &&
    data.odometer_end < data.odometer_start
  ) {
    errors.push("odometer_end must be greater than or equal to odometer_start");
  }

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH TRIP VALIDATION ----
export const validateTripPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
