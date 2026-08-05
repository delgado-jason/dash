import { isValidType } from "../helper.js";

// The curated category vocabulary. Stored as plain text on the row; validated here
// so a typo can't fragment "Escort" vs "Escorts". Keep in lockstep with the
// frontend list in lib/constants/vendorCategories.ts. 'Shop' is load-bearing — it
// gates the maintenance spend readout — so don't rename it without updating the
// service query.
export const VENDOR_CATEGORIES = [
  "Shop",
  "Escort / Pilot Car",
  "Permits",
  "Tires",
  "Parts",
  "Towing",
  "Washout",
  "Securement",
  "Scale",
  "Other",
];

const VENDOR_STATUSES = ["active", "inactive"];

const nonBlankString = (label) => (value, errors) => {
  if (!value) return;
  if (!isValidType("string", value)) {
    errors.push(`${label} must be a string`);
    return;
  }
  if (value.trim().length === 0) errors.push(`${label} cannot be blank`);
};

const rules = {
  name: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("name must be a string");
      return;
    }
    if (value.trim().length === 0) errors.push("name cannot be blank");
  },
  category: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("category must be a string");
      return;
    }
    if (!VENDOR_CATEGORIES.includes(value.trim())) {
      errors.push("not a valid category");
    }
  },
  rating: (value, errors) => {
    if (!value) return;
    if (!isValidType("integer", value)) {
      errors.push("rating must be an integer");
      return;
    }
    if (value < 1 || value > 5) errors.push("rating must be between 1 and 5");
  },
  contact_name: nonBlankString("contact_name"),
  phone: nonBlankString("phone"),
  email: (value, errors) => {
    if (!value) return;
    if (!isValidType("string", value)) {
      errors.push("email must be a string");
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      errors.push("email cannot be blank");
      return;
    }
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      errors.push("not a valid email");
    }
  },
  website: nonBlankString("website"),
  city: nonBlankString("city"),
  state: (value, errors) => {
    if (!value) return;
    if (!isValidType("string", value)) {
      errors.push("state must be a string");
      return;
    }
    if (value.trim().length !== 2) errors.push("state must be 2 letters");
  },
  service_area: nonBlankString("service_area"),
  status: (value, errors) => {
    if (!value) return;
    if (!VENDOR_STATUSES.includes(value)) errors.push("not a valid status");
  },
  notes: nonBlankString("notes"),
};

// ---- CREATE VENDOR VALIDATION ----
export const validateVendorCreate = (data) => {
  const errors = [];

  if (!data.name) errors.push("Missing name");
  if (!data.category) errors.push("Missing category");

  for (const field in data) {
    if (rules[field]) rules[field](data[field], errors);
  }

  return errors;
};

// ---- PATCH VENDOR VALIDATION ----
export const validateVendorPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) rules[field](data[field], errors);
  }

  return errors;
};
