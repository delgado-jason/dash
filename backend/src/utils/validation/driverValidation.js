const rules = {
  first_name: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("first_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("first_name cannot be blank");
    }
    if (trimmed.length > 50) {
      errors.push("first_name cannot exceed 50 characters");
    }
  },
  last_name: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("last_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("last_name cannot be blank");
    }
    if (trimmed.length > 50) {
      errors.push("last_name cannot exceed 50 characters");
    }
  },
};

// ---- CREATE DRIVER VALIDATION ----
export const validateDriverCreate = (data) => {
  const errors = [];

  if (!data.first_name) errors.push("Missing first_name");
  if (!data.last_name) errors.push("Missing last_name");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH DRIVER VALIDATION ----
export const validateDriverPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
