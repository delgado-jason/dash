const currentYear = new Date().getFullYear();

const rules = {
  unit_number: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("unit_number must be a string");
    }
    if (value.length === 0) {
      errors.push("unit_number cannot be blank");
    }
    if (value.length > 20) {
      errors.push("unit_number cannot exceed 20 characters");
    }
  },

  vin: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("vin must be a string");
    }
    if (value.trim().length !== 17) {
      errors.push("vin must be exactly 17 characters");
    }
  },

  plate_number: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("plate_number must be a string");
    }
    // Plate numbers are 6-8 chars long (not including) a ' ' or '-'
    if (value.trim().length < 6 || value.trim().length > 9) {
      errors.push("plate numbers must be 6-9 chars long");
    }
  },
  plate_state: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("plate_state must be a string");
    }

    if (value.trim().length !== 2) {
      errors.push("plate_state must be 2 characters");
    }
  },
  make: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("make must be a string");
    }

    if (value.trim().length > 50) {
      errors.push("'make' cannot be more than 50 chars");
    }

    if (value.trim().length === 0) {
      errors.push("make cannot be blank");
    }
  },
  model: (value, errors) => {
    if (typeof value !== "string") {
      errors.push("model must be a string");
    }

    if (value.trim().length > 50) {
      errors.push("model cannot be more than 50 chars");
    }
  },
  year: (value, errors) => {
    if (typeof value !== "number") {
      errors.push("year must be a number");
    }

    if (value < 1980) {
      errors.push("year must be greater than 1980");
    }

    if (value > currentYear + 1) {
      errors.push(`year cannot be greater than ${currentYear + 1}`);
    }
  },
  current_odometer: (value, errors) => {
    if (typeof value !== "number") {
      errors.push("current_odometer must be a number");
    }

    if (value < 0) {
      errors.push("current_odometer cannot be less than 0");
    }

    // Create validation rule in future to make sure current_odometer
    // is greater than last reported odometer.
  },
  status: (value, errors) => {
    const allowedStatusTypes = [
      "active",
      "inactive",
      "maintenance",
      "out_of_service",
    ];

    if (typeof value !== "string") {
      errors.push("status type must be a string");
    }

    if (!allowedStatusTypes.includes(value)) {
      errors.push("status type not allowed");
    }
  },
  in_service_date: (value, errors) => {
    const date = new Date(value);

    if (isNaN(date.getTime())) {
      errors.push("in_service_date must be a valid date");
      return;
    }

    const today = new Date();

    if (date > today) {
      errors.push("in_service_date cannot be in the future");
    }
  },
};

export const validateTruckPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
