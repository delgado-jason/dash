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

// A calendar day, the only shape a `since` floor may take.
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The account's calendar — Brandie's, the one the SOP's week and year are
// written in. Every "what year is it" question on this surface is asked in
// Central time.
export const ACCOUNT_TIME_ZONE = "America/Chicago";

// The year the ACCOUNT is living in, named in Central time whatever the
// container's clock is set to. Not `now.getFullYear()` (that is the server's
// own local calendar — a UTC container rolls over at 6pm Central on Dec 31 and
// empties the shelf hours early) and not `toISOString()` (same bug, one time
// zone over).
const accountYear = (now) =>
  new Intl.DateTimeFormat("en-US", { timeZone: ACCOUNT_TIME_ZONE, year: "numeric" }).format(now);

// The settlement-only shelf's floor (Agencies Nod Sheet, decision 8 as Jason
// amended it): dash started tracking in 2026, so settlements older than the
// current year are history nobody entered and stay off the page. The default
// is Jan 1 of the year the ACCOUNT is living in — Central, per above.
//
// Pure on purpose: `{ since, error }` rather than a throw, so the rule can be
// proved without booting the service and its database pool. The service turns
// a non-null `error` into the 400.
export const parseSettlementSince = (value, now = new Date()) => {
  if (value === undefined || value === null || value === "") {
    return { since: `${accountYear(now)}-01-01`, error: null };
  }

  if (!isValidType("string", value)) {
    return { since: null, error: "since must be a YYYY-MM-DD date" };
  }

  const trimmed = value.trim();

  if (!DAY_PATTERN.test(trimmed)) {
    return { since: null, error: "since must be a YYYY-MM-DD date" };
  }

  // The shape is right; is it a day that exists? `new Date` happily rolls
  // 2026-02-30 forward to March 2, so the round-trip is the real check.
  const parsed = new Date(`${trimmed}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return { since: null, error: "since is not a real calendar date" };
  }

  return { since: trimmed, error: null };
};

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
