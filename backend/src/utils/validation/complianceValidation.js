import { isValidType, isDateValid, isValidUUID } from "../helper.js";

/**
 * Fields to validate:
 * scope, label, category, issued_on, expires_on,
 * renewal_months, warn_lead_days, doc_number, notes,
 * driver_id, truck_id, trailer_id
 */

const SCOPES = ["business", "driver", "truck", "trailer"];

const dateRule = (name) => (value, errors) => {
  if (value === null) return; // clearing a date is allowed
  if (!isValidType("string", value)) {
    errors.push(`${name} must be a string`);
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length !== 10) errors.push(`${name} must be 10 chars (yyyy-mm-dd)`);
  else if (!isDateValid(trimmed)) errors.push(`Invalid date for ${name}`);
};

const uuidRule = (name) => (value, errors) => {
  if (value === null) return;
  if (!isValidType("string", value) || !isValidUUID(value))
    errors.push(`${name} must be a valid UUID`);
};

const rules = {
  scope: (value, errors) => {
    if (!isValidType("string", value) || !SCOPES.includes(value))
      errors.push("scope must be one of business, driver, truck, trailer");
  },
  label: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("label must be a string");
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) errors.push("label cannot be blank");
    if (trimmed.length > 120) errors.push("label cannot be more than 120 chars");
  },
  category: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("string", value)) errors.push("category must be a string");
    else if (value.trim().length > 40)
      errors.push("category cannot be more than 40 chars");
  },
  issued_on: dateRule("issued_on"),
  expires_on: dateRule("expires_on"),
  renewal_months: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("integer", value)) {
      errors.push("renewal_months must be an integer");
      return;
    }
    if (value < 1 || value > 120)
      errors.push("renewal_months must be between 1 and 120");
  },
  warn_lead_days: (value, errors) => {
    if (value === undefined) return;
    if (!isValidType("integer", value)) {
      errors.push("warn_lead_days must be an integer");
      return;
    }
    if (value < 0 || value > 365)
      errors.push("warn_lead_days must be between 0 and 365");
  },
  doc_number: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("string", value)) errors.push("doc_number must be a string");
    else if (value.trim().length > 60)
      errors.push("doc_number cannot be more than 60 chars");
  },
  notes: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("string", value)) errors.push("notes must be a string");
    else if (value.trim().length > 500)
      errors.push("notes cannot be more than 500 chars");
  },
  driver_id: uuidRule("driver_id"),
  truck_id: uuidRule("truck_id"),
  trailer_id: uuidRule("trailer_id"),
};

export const validateComplianceCreate = (data) => {
  const errors = [];
  if (data.scope === undefined) errors.push("Missing scope");
  if (data.label === undefined) errors.push("Missing label");

  for (const field in data) {
    if (rules[field]) rules[field](data[field], errors);
  }
  return errors;
};

export const validateCompliancePatch = (data) => {
  const errors = [];
  for (const field in data) {
    if (rules[field]) rules[field](data[field], errors);
  }
  return errors;
};
