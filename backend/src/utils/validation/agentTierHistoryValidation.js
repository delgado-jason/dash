import { isValidUUID } from "../helper.js";

// agent_tier_history (073) — the tier's paper trail. Two readers and one
// writer live here:
//   GET  /agents/tier-history?since=&agent_id=   the account's rows, joined
//   POST /agents/:agent_id/tier-hold             the owner's HOLD on a
//        suggestion: a row with from_tier = to_tier = the current tier and a
//        reason that starts "hold — {evidence}". The frontend hides the
//        suggestion while the evidence in that reason still matches what it
//        computes now (REL-01 v2.0 §5G; the PR 4 spec's hold rule).
// A real tier move never comes through here — that is the gated PATCH.

export const HOLD_PREFIX = "hold — ";
export const REASON_MAX = 500;

// A DATE-shaped filter: a bare day key, never a timestamp.
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isDayKey = (v) => {
  if (typeof v !== "string" || !DAY_KEY.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
};

// ---- GET query ----
// Both filters are optional; an empty string reads as "not given".
export const validateTierHistoryQuery = (query) => {
  const q = query ?? {};
  const errors = [];
  if (q.since != null && q.since !== "" && !isDayKey(q.since))
    errors.push("since must be a YYYY-MM-DD date");
  if (q.agent_id != null && q.agent_id !== "" && (typeof q.agent_id !== "string" || !isValidUUID(q.agent_id)))
    errors.push("agent_id must be a UUID");
  return errors;
};

// ---- POST tier-hold ----
// The stored reason always carries the prefix — it is what the suppression
// reads — so a client that sends the bare evidence still lands correctly. The
// prefix test is case-insensitive: the reader (isHoldRow) lowercases before it
// compares, so "Hold — x" is already a hold and must not be prefixed twice.
export const holdReason = (reason) => {
  const r = String(reason).trim();
  return r.slice(0, HOLD_PREFIX.length).toLowerCase() === HOLD_PREFIX ? r : `${HOLD_PREFIX}${r}`;
};

export const validateTierHold = (data) => {
  const d = data ?? {};
  const errors = [];
  if (typeof d.reason !== "string" || d.reason.trim().length === 0) {
    errors.push("A hold needs a reason — the evidence it sets aside.");
  } else if (holdReason(d.reason).length > REASON_MAX) {
    errors.push(`reason cannot be more than ${REASON_MAX} characters`);
  }
  for (const field of Object.keys(d)) {
    if (field !== "reason") errors.push(`${field} not allowed`);
  }
  return errors;
};
