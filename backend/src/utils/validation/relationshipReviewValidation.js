// relationship_reviews (073) — the month sign-off and the quarter audit
// (REL-01 v2.0 §5H). One row per (account, period, kind), upserted: signing a
// month again replaces its targets and re-stamps who and when.
//   period_key  'YYYY-MM' for a month · 'YYYY-Qn' for a quarter — the shape is
//               judged against the kind, so a quarter can't be filed under a
//               month key by accident
//   targets     the owner's targets for the period ahead: one to three lines
//               for a month, one to five names to pursue for a quarter. The
//               number is a CEILING, never a quota — a quiet month still names
//               one target, and the sheet, its counter and this rule all say
//               "one to five".

export const REVIEW_KINDS = ["month", "quarter"];
export const TARGET_LINES_MAX = { month: 3, quarter: 5 };
export const TARGETS_MAX = 2000;
const FIELDS = ["period_key", "kind", "targets"];

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const QUARTER_KEY = /^\d{4}-Q[1-4]$/;

export const isPeriodKey = (key, kind) =>
  typeof key === "string" && (kind === "month" ? MONTH_KEY : QUARTER_KEY).test(key);

// The non-blank lines of a targets block — what "one to three lines" counts.
export const targetLines = (targets) =>
  String(targets ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export const validateRelationshipReview = (data) => {
  const d = data ?? {};
  const errors = [];

  if (!REVIEW_KINDS.includes(d.kind)) {
    errors.push("kind must be month or quarter");
  } else if (!isPeriodKey(d.period_key, d.kind)) {
    errors.push(d.kind === "month" ? "period_key must be YYYY-MM for a month" : "period_key must be YYYY-Qn for a quarter");
  }

  if (typeof d.targets !== "string") {
    errors.push("targets must be a string");
  } else if (d.targets.length > TARGETS_MAX) {
    errors.push(`targets cannot be more than ${TARGETS_MAX} characters`);
  } else {
    const lines = targetLines(d.targets).length;
    const max = TARGET_LINES_MAX[d.kind] ?? TARGET_LINES_MAX.month;
    if (lines === 0) errors.push("targets needs at least one line");
    else if (lines > max) errors.push(`targets is one to ${max} lines`);
  }

  for (const field of Object.keys(d)) {
    if (!FIELDS.includes(field)) errors.push(`${field} not allowed`);
  }
  return errors;
};
