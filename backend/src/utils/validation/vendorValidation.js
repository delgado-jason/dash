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

// vendors.name is VARCHAR(120); an alias is one more spelling of that same
// name, so it keeps the same cap. A dismissed one-off is a log spelling, which
// is the same text again — one number for all three.
export const ALIAS_MAX = 120;

// Postgres's btrim / TRIM strip ASCII spaces only; JS's trim() strips every
// Unicode space (tabs, newlines, NBSP). A log row pasted with a trailing NBSP
// is grouped by SQL under a key that still ends in that NBSP, so the app must
// never out-trim the database — or the key it sends misses the key the DB
// generated for the same text, and a One-off or a Merge silently does nothing.
export const asciiTrim = (s) => String(s).replace(/^ +| +$/g, "");

// The one match key for a vendor name — the SAME key the DB generates for
// maintenance_vendor_dismissals.name_key (`lower(btrim(name))`): trim the
// ASCII-space ends, lowercase, and nothing else. No inner-whitespace collapsing,
// or the app would say two names match where the UNIQUE constraint says they
// don't.
export const nameKey = (s) => asciiTrim(s).toLowerCase();

// A name arriving in a body — the alias to merge, the one-off to dismiss, the
// one-off to restore. Same three questions every time.
export const validateVendorName = (value, label = "name") => {
  const errors = [];
  if (!isValidType("string", value)) {
    errors.push(`${label} must be a string`);
    return errors;
  }
  // Blank by any whitespace is blank; the length cap is on what gets stored.
  if (value.trim().length === 0) errors.push(`${label} cannot be blank`);
  else if (asciiTrim(value).length > ALIAS_MAX)
    errors.push(`${label} must be ${ALIAS_MAX} characters or fewer`);
  return errors;
};

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
