// The body behind "Mark renewed" — the same four fields whether the subject is
// a compliance_items row or a driver's CDL.
//
// Every message here is a SENTENCE, because the frontend shows `error` verbatim
// under the sheet. Errors accumulate: a body with two problems reports both.

const ALLOWED = ["renewed_on", "next_expires_on", "doc_number", "note"];

// Two different columns take the number, so the cap is a parameter rather than
// a constant: compliance_items.doc_number is `text` (60 is this app's rule for
// it), while drivers.cdl_number is VARCHAR(50) — a 51st character there is a
// Postgres error, not a validation message, so the CDL path caps at the column.
export const DOC_NUMBER_MAX = 60; // matches compliance_items.doc_number's rule
export const CDL_NUMBER_MAX = 50; // drivers.cdl_number is VARCHAR(50)
export const NOTE_MAX = 500;

// A DATE column's day key, and a REAL day: `new Date("2026-02-30")` rolls over
// to March 2 rather than failing, so the only honest test is to format the
// parsed day back and compare. UTC on both ends — a day key has no zone.
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const isDayKey = (v) => {
  if (typeof v !== "string" || !DAY_KEY.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
};

const utcDayKey = (d) => d.toISOString().slice(0, 10);

// The far edge of "today". The server's zone is not the owner's (Railway runs
// UTC, the business is Central), so the ceiling is UTC-today + 1: a full day of
// slack, which is what a Central evening needs and still refuses next month.
const tomorrowKey = (now) =>
  utcDayKey(new Date(Date.parse(`${utcDayKey(now)}T00:00:00Z`) + 86_400_000));

/**
 * @param {object} body  { renewed_on, next_expires_on?, doc_number?, note? }
 * @param {Date}   now   injected so the "not in the future" rule is testable
 *                       against a frozen day (CLAUDE.md: control the clock)
 * @param {object} [opts]          { docMax } — the document number's ceiling,
 *                                 DOC_NUMBER_MAX unless the caller's column is
 *                                 narrower (the CDL path passes CDL_NUMBER_MAX)
 * @returns {string[]}   every problem found, as sentences
 */
export const validateComplianceRenewal = (
  body,
  now = new Date(),
  { docMax = DOC_NUMBER_MAX } = {},
) => {
  const errors = [];
  const data = body ?? {};

  for (const field in data)
    if (!ALLOWED.includes(field)) errors.push(`${field} not allowed`);

  // ---- renewed_on — the only required field ----
  if (data.renewed_on == null || data.renewed_on === "") {
    errors.push("A renewal needs the day it was renewed.");
  } else if (!isDayKey(data.renewed_on)) {
    errors.push("renewed_on must be a real YYYY-MM-DD date.");
  } else if (data.renewed_on > tomorrowKey(now)) {
    errors.push("A renewal can't be dated in the future.");
  }

  // ---- next_expires_on — may be null (the cadence fills it in) ----
  let nextOk = false;
  if (data.next_expires_on != null && data.next_expires_on !== "") {
    if (!isDayKey(data.next_expires_on))
      errors.push("next_expires_on must be a real YYYY-MM-DD date.");
    else nextOk = true;
  }
  // Day keys are fixed-width and zero-padded, so a string compare IS a date
  // compare — no parsing, no zone.
  if (nextOk && isDayKey(data.renewed_on) && data.next_expires_on <= data.renewed_on)
    errors.push("The next expiry has to come after the renewal date.");

  // ---- the two optional strings ----
  if (data.doc_number != null) {
    if (typeof data.doc_number !== "string")
      errors.push("doc_number must be a string.");
    else if (data.doc_number.trim().length > docMax)
      errors.push(`doc_number cannot be more than ${docMax} chars.`);
  }
  if (data.note != null) {
    if (typeof data.note !== "string") errors.push("note must be a string.");
    else if (data.note.trim().length > NOTE_MAX)
      errors.push(`note cannot be more than ${NOTE_MAX} chars.`);
  }

  return errors;
};

// The next expiry the CADENCE implies: calendar months, clamped to the end of
// the landing month. Jan 31 + 1 mo is Feb 28 (Feb 29 in a leap year), never
// March 3 by day-overflow — the same clamp the frontend's touch chips use.
// Pure string→string on day keys, so no Date, no zone, no DST.
export const addMonths = (dayKey, months) => {
  if (!isDayKey(dayKey) || !Number.isInteger(months)) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  // Month as a 0-based absolute count, so the year rolls with it.
  const abs = (y - 1) * 12 + (m - 1) + months;
  const year = Math.floor(abs / 12) + 1;
  const month = (abs % 12) + 1;
  // Day 0 of the FOLLOWING month is the last day of this one.
  const lastOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastOfMonth);
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
};
