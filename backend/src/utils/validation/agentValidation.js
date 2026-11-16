import { isValidType, isValidUUID } from "../helper.js";
import { postingCodeRule } from "./agencyValidation.js";

//** Rules for allowed fields
// agency_id,
// posting_code,
// first_name,
// last_name,
// phone,
// email,
// preferred_contact,
// rating,
// notes */

const rules = {
  // Optional since 073: a prospect is a person first, the agency is billing
  // paperwork that may not be known yet. null clears it.
  agency_id: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("string", value) || !isValidUUID(value)) {
      errors.push("agency_id is not a valid UUID");
    }
  },
  // The agent's OWN code on the freight bill (MAM). Optional and nullable —
  // null means they post from the agency's own desk, under its agency code.
  posting_code: postingCodeRule,
  first_name: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("first_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("first_name cannot be blank");
    }

    if (trimmed.length > 50) {
      errors.push("first_name cannot be more than 50 characters");
    }
  },
  last_name: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("last_name must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("last_name cannot be blank");
    }

    if (trimmed.length > 50) {
      errors.push("last_name cannot be more than 50 characters");
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

    if (trimmed.length > 50) {
      errors.push("phone cannot be more than 50 characters");
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

    if (trimmed.length > 50) {
      errors.push("email cannot be more than 50 characters");
    }
  },
  // Where the agent sits. Both skip on null/blank — null clears the column.
  agent_city: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("agent_city must be a string");
      return;
    }

    if (value.trim().length > 100) {
      errors.push("agent_city cannot be more than 100 characters");
    }
  },
  agent_state: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("agent_state must be a string");
      return;
    }

    if (!/^[A-Za-z]{2}$/.test(value.trim())) {
      errors.push("agent_state must be a 2-letter state code");
    }
  },
  preferred_contact: (value, errors) => {
    if (!value) return;

    const methods = ["phone", "email", "text"];

    if (!isValidType("string", value)) {
      errors.push("preferred_contact must be a string");
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("preferred_contact cannot be blank");
    }

    if (!methods.includes(trimmed)) {
      errors.push("not a valid method");
    }
  },
  rating: (value, errors) => {
    if (!value) return;

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
  // null clears the override back to auto (data-derived); otherwise a pin.
  // 'unclear' = asked and couldn't tell. It is NOT the same as null (never
  // asked), and it is deliberately not 'spot' — only a pinned 'spot' may park
  // an agent, so an inconclusive call can never drop one out of the book.
  agent_class: (value, errors) => {
    if (value === null || value === undefined) return;
    if (value !== "direct" && value !== "unclear" && value !== "spot") {
      errors.push("agent_class must be 'direct', 'unclear', 'spot', or null");
    }
  },

  // Parked agents leave every working view (due queue, call lists, sweep) but
  // stay in every analytical one. The DB additionally refuses to park an agent
  // whose class is not a pinned 'spot'.
  work_status: (value, errors) => {
    if (value !== "active" && value !== "parked") {
      errors.push("work_status must be 'active' or 'parked'");
    }
  },

  // Why this row left the call book. Either a pinned 'spot' (the freight
  // reason) or a written reason unlocks parking — see 069. null clears it.
  park_reason: (value, errors) => {
    if (value === null) return;
    if (!isValidType("string", value)) {
      errors.push("park_reason must be a string");
      return;
    }
    if (value.trim().length > 500) {
      errors.push("park_reason cannot be more than 500 characters");
    }
  },

  // Free text from the footprint's sixth question ("best number, and best
  // time of day?"). null clears it.
  best_time_to_call: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("string", value)) {
      errors.push("best_time_to_call must be a string");
      return;
    }
    if (value.trim().length > 80) {
      errors.push("best_time_to_call cannot be more than 80 characters");
    }
  },

  // Mirrors the load_type enum so a claimed capability can be checked against
  // what the agent has actually tendered.
  freight_types: (value, errors) => {
    if (!Array.isArray(value)) {
      errors.push("freight_types must be an array");
      return;
    }

    const allowed = ["standard flatbed", "oversize", "hazmat", "heavy haul"];

    for (const t of value) {
      if (!allowed.includes(t)) {
        errors.push(`freight_types must be one of: ${allowed.join(", ")}`);
        return;
      }
    }
  },
};

// The rules above measure the TRIMMED value, so the row has to store the
// trimmed value too — agent_state is varchar(2) and would refuse " OK " with
// a raw Postgres 22001 after the rules had already passed it. Runs in place
// on the payload before validation; anything that isn't a string is left for
// the rules to judge.
const TRIMMED_TEXT = ["first_name", "last_name", "phone", "email", "agent_city"];

export const normalizeAgentText = (data) => {
  for (const field of TRIMMED_TEXT) {
    if (typeof data[field] === "string") data[field] = data[field].trim();
  }
  // A name is one run of single-spaced words: "Jane  Doe " is stored "Jane Doe"
  // (GL-220 — stray spaces split an agent into two keys on every join).
  for (const field of ["first_name", "last_name"]) {
    if (typeof data[field] === "string") data[field] = data[field].replace(/\s+/g, " ");
  }
  if (typeof data.agent_state === "string") {
    data.agent_state = data.agent_state.trim().toUpperCase();
  }
  // Blank reads as "not on file" — store null, never an empty string.
  if (typeof data.best_time_to_call === "string") {
    const t = data.best_time_to_call.trim();
    data.best_time_to_call = t === "" ? null : t;
  }
  // The posting code is a Landstar code: uppercase on every bill, so a typed
  // "mam" is normalized rather than refused. Blank means they post from the
  // agency's own desk — that is NULL, never "" (varchar(3) would store it and
  // codeOf would then draw an empty chip).
  if (typeof data.posting_code === "string") {
    const t = data.posting_code.trim().toUpperCase();
    data.posting_code = t === "" ? null : t;
  }
  return data;
};

// ---- CREATE AGENT VALIDATION ----
export const validateAgentCreate = (data) => {
  const errors = [];

  // agency_id is optional since 073 — a prospect may arrive without a code.
  if (!data.first_name) errors.push("Missing first_name");
  if (!data.last_name) errors.push("Missing last_name");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};

// ---- PATCH AGENT VALIDATION ----
export const validateAgentPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
