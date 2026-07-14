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
  name: (v, e) => nonBlankString("name", v, e),
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
};

// ---- CREATE FACILITY VALIDATION ----
export const validateFacilityCreate = (data) => {
  const errors = [];

  if (!data.name) errors.push("Missing name");
  if (!data.city) errors.push("Missing city");
  if (!data.state) errors.push("Missing state");

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
