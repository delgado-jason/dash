import { isValidType } from "../helper.js";

//** Rules for allowed fields
// name, city, state, address, notes */

const nonBlankString = (field, value, errors) => {
  if (!isValidType("string", value)) {
    errors.push(`${field} must be a string`);
    return;
  }
  if (value.trim().length === 0) errors.push(`${field} cannot be blank`);
};

const optionalString = (field, value, errors) => {
  if (value === null || value === undefined || value === "") return;
  if (!isValidType("string", value)) errors.push(`${field} must be a string`);
};

const rules = {
  // Name is optional at the field level — a job site may have none; the create
  // check below requires it for a business.
  name: (v, e) => optionalString("name", v, e),
  city: (v, e) => nonBlankString("city", v, e),
  state: (v, e) => {
    if (!isValidType("string", v)) {
      e.push("state must be a string");
      return;
    }
    if (v.trim().length !== 2) e.push("state must be a 2-letter code");
  },
  address: (v, e) => optionalString("address", v, e),
  notes: (v, e) => optionalString("notes", v, e),
  kind: (v, e) => {
    if (v !== "business" && v !== "job_site")
      e.push("kind must be business or job_site");
  },
};

// ---- CREATE FACILITY VALIDATION ----
export const validateFacilityCreate = (data) => {
  const errors = [];
  const kind = data.kind ?? "business";

  if (!data.city) errors.push("Missing city");
  if (!data.state) errors.push("Missing state");
  // A business is identified by name; a job site by its address.
  if (kind === "job_site") {
    if (!data.address) errors.push("A job site needs an address");
  } else if (!data.name) {
    errors.push("Missing name");
  }

  for (const field in data) {
    if (rules[field]) rules[field](data[field], errors);
  }

  return errors;
};

// ---- PATCH FACILITY VALIDATION ----
export const validateFacilityPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) rules[field](data[field], errors);
  }

  return errors;
};
