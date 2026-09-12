import { isValidUUID } from "../helper.js";

// One touch, either direction. These lists are a second source of truth for
// the Postgres enums / CHECKs (064, 068, 073) — a value added there without
// being added here is accepted by the database and rejected by the API.
export const CONTACT_TYPES = [
  // v1 (064/068) — the retired ones stay valid for the rows that carry them
  "capacity",
  "check_in",
  "appreciation",
  "close_out",
  "cold",
  "inbound_inquiry",
  "qualification",
  "other",
  // v2 (073) — REL-01 v2.0's vocabulary
  "milestone",
  "holiday",
  "reactivation",
  "owner_personal",
  "load_in_progress",
  "freight_bill",
];
export const DIRECTIONS = ["outbound", "inbound"];
export const METHODS = ["call", "email", "text"];
export const OUTCOMES = ["reached", "voicemail", "no_answer", "bad_number"];
export const NEXT_STEPS = ["call_back", "on_their_list", "send_capacity", "none"];

// A DATE column takes a plain day key — never a timestamp, which would shift
// a day depending on the server's zone.
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isDayKey = (v) => {
  if (typeof v !== "string" || !DAY_KEY.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
};

// Optional fields: null/undefined always pass (null clears the column).
const optional = {
  contacted_at: (v, errors) => {
    if (v == null) return;
    if (Number.isNaN(Date.parse(v))) errors.push("contacted_at must be a valid timestamp");
  },
  note: (v, errors) => {
    if (v == null) return;
    if (typeof v !== "string") errors.push("note must be a string");
  },
  load_id: (v, errors) => {
    if (v == null) return;
    if (typeof v !== "string" || !isValidUUID(v)) errors.push("load_id must be a UUID");
  },
  outcome: (v, errors) => {
    if (v == null) return;
    if (!OUTCOMES.includes(v)) errors.push(`outcome must be one of ${OUTCOMES.join(", ")}`);
  },
  next_step: (v, errors) => {
    if (v == null) return;
    if (!NEXT_STEPS.includes(v)) errors.push(`next_step must be one of ${NEXT_STEPS.join(", ")}`);
  },
  next_step_at: (v, errors) => {
    if (v == null) return;
    if (!isDayKey(v)) errors.push("next_step_at must be a YYYY-MM-DD date");
  },
  footprint_captured: (v, errors) => {
    if (v == null) return;
    if (typeof v !== "boolean") errors.push("footprint_captured must be true or false");
  },
  cap_override: (v, errors) => {
    if (v == null) return;
    if (typeof v !== "boolean") errors.push("cap_override must be true or false");
  },
  combined_types: (v, errors) => {
    if (v == null) return;
    if (!Array.isArray(v)) {
      errors.push("combined_types must be an array");
      return;
    }
    for (const t of v) {
      if (!CONTACT_TYPES.includes(t)) {
        errors.push(`combined_types must be contact types (${CONTACT_TYPES.join(", ")})`);
        return;
      }
    }
  },
};

// ---- CREATE ----
export const validateAgentContactCreate = (data) => {
  const errors = [];
  if (!data.agent_id) errors.push("agent_id is required");
  if (!DIRECTIONS.includes(data.direction))
    errors.push("direction must be outbound or inbound");
  if (!METHODS.includes(data.method))
    errors.push("method must be call, email, or text");
  if (!CONTACT_TYPES.includes(data.type))
    errors.push(`type must be one of ${CONTACT_TYPES.join(", ")}`);
  // Did anyone pick up — a question only a call can answer. An email or a
  // text with an outcome would read as a two-way contact it never was.
  if (data.outcome != null && data.method !== "call")
    errors.push("outcome only applies to a call");
  for (const field of Object.keys(optional)) {
    if (field in data) optional[field](data[field], errors);
  }
  return errors;
};

// ---- PATCH ----
// What may change after the fact: the fold ("this message also carried a
// milestone"), the note, and the follow-up bookkeeping. Never the identity of
// the touch (agent, direction, method, type, when) — a mis-log is deleted, not
// rewritten, so the metrics can't be quietly edited into shape.
export const PATCHABLE_CONTACT_FIELDS = [
  "note",
  "outcome",
  "next_step",
  "next_step_at",
  "footprint_captured",
  "combined_types",
];

export const validateAgentContactPatch = (data) => {
  const errors = [];
  const fields = Object.keys(data ?? {});
  if (fields.length === 0) {
    errors.push("No valid fields provided for update");
    return errors;
  }
  for (const field of fields) {
    if (!PATCHABLE_CONTACT_FIELDS.includes(field)) {
      errors.push(`${field} not allowed`);
      continue;
    }
    optional[field](data[field], errors);
  }
  return errors;
};
