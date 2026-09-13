import { isValidType } from "../helper.js";

//** Rules for allowed fields
// agency_code,
// name,
// phone,
// email,
// rating,
// notes */

// A Landstar code is three uppercase letters, whichever row it sits on: the
// agency's own code (CPL) on the agency, the person's own posting code (MAM)
// on the agent. One shape, one rule.
export const CODE_PATTERN = /^[A-Z]{3}$/;

// The only fields a CLIENT may write on an agency, and the list the service
// refuses everything else against. It lives here, next to the rules that judge
// those same fields, so the whitelist and the validators can never drift — and
// so a test can prove what is refused without booting the service and its
// database pool.
//
// posting_codes is deliberately absent from BOTH lists: it is EVIDENCE (075
// §5d) that the settlement feed appends to from what the freight bills
// actually posted. A client that sends it is refused before anything reaches
// the DB. agency_id, user_id, created_at and updated_at are the row's own
// bookkeeping and are likewise never client-written.
export const AGENCY_CREATE_FIELDS = Object.freeze([
  "agency_code",
  "name",
  "phone",
  "email",
  "rating",
  "notes",
]);

// PATCH takes the same set — agency_code included, since a code typed wrong
// has to be fixable. (Kept as its own export rather than an alias: the two
// lists answer different questions and one may outlive the other.)
export const AGENCY_PATCH_FIELDS = Object.freeze([
  "agency_code",
  "name",
  "phone",
  "email",
  "rating",
  "notes",
]);

const codeRule = (field) => (value, errors) => {
  if (!isValidType("string", value)) {
    errors.push(`${field} must be a string`);
    return;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    errors.push(`${field} cannot be blank`);
    return;
  }

  if (!CODE_PATTERN.test(trimmed)) {
    errors.push(`${field} must be 3 uppercase letters`);
  }
};

// The agent's own posting code — shared with agentValidation. Optional and
// nullable: null means they post from the agency's own desk.
export const postingCodeRule = (value, errors) => {
  if (value === null || value === undefined) return;
  codeRule("posting_code")(value, errors);
};

const rules = {
  agency_code: codeRule("agency_code"),
  // The legal name off the freight bill. NULL until a bill names it, so a
  // blank is a real state and never an error.
  name: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("name cannot be blank");
    }

    if (trimmed.length > 120) {
      errors.push("name cannot be more than 120 characters");
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
  rating: (value, errors) => {
    // Only "not on file" skips the check. `0` is a REAL number the caller
    // sent, and the column's CHECK refuses it — catching it here is a 400
    // with a sentence instead of a raw Postgres 500.
    if (value === null || value === undefined) return;

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

// A Landstar code is written uppercase on every bill, but a person typing one
// into dash may not be. Normalize rather than refuse: trim and upper the code,
// and collapse a blank name to NULL — "" is not "no name on file", and it
// would sort FIRST under `ORDER BY name NULLS LAST`. Runs in place on the
// payload BEFORE validation and before the write, so the row stores exactly
// what the rules measured; a non-string is left for the rules to judge.
export const normalizeAgencyText = (data) => {
  if (typeof data.agency_code === "string") {
    data.agency_code = data.agency_code.trim().toUpperCase();
  }
  if (typeof data.name === "string") {
    const trimmed = data.name.trim();
    data.name = trimmed === "" ? null : trimmed;
  }
  return data;
};

// ---- CREATE AGENCY VALIDATION ----
export const validateAgencyCreate = (data) => {
  const errors = [];

  if (!data.agency_code) errors.push("Missing agency_code");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH AGENCY VALIDATION ----
export const validateAgencyPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
