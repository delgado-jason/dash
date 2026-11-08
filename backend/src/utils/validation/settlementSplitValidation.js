// NET-01 · dated settlement splits (the carrier's cut, by start date). Pure —
// no database. Returns { values, errors } in the house pattern; a blank is
// never zero (a blank pct would read as 0% and zero every load's net).
// `current` (optional) is the stored row on a patch: the sum rule judges the
// merge of `current` and the incoming values.
import { isBlank, toNumber, isCalendarDate } from "./moneyFields.js";

export const SPLIT_PCT_FIELDS = ["linehaul_pct", "trailer_pct", "fuel_surcharge_pct", "accessorial_pct"];

const DATE_REQUIRED = "effective_from is required — the day the split starts (YYYY-MM-DD)";
const DATE_BAD = "effective_from must be a calendar day written YYYY-MM-DD";

export function validateSettlementSplit(data, { partial = false, current = null } = {}) {
  const d = data && typeof data === "object" ? data : {};
  const values = {};
  const errors = [];

  if (d.effective_from === undefined && !partial) {
    errors.push(DATE_REQUIRED);
  } else if (d.effective_from !== undefined) {
    if (isBlank(d.effective_from) && !partial) errors.push(DATE_REQUIRED);
    else if (!isCalendarDate(d.effective_from)) errors.push(DATE_BAD);
    else values.effective_from = d.effective_from.trim();
  }

  for (const f of SPLIT_PCT_FIELDS) {
    if (d[f] === undefined && !partial) {
      errors.push(`${f} must be a fraction 0–1 (a blank would read as 0)`);
    } else if (d[f] !== undefined) {
      const n = toNumber(d[f]);
      if (n === null || n < 0 || n > 1) errors.push(`${f} must be a fraction 0–1 (a blank would read as 0)`);
      else values[f] = n;
    }
  }

  if (d.note !== undefined) {
    const note = d.note === null ? "" : String(d.note).trim();
    if (note.length > 200) errors.push("note is longer than 200 characters");
    else values.note = note === "" ? null : note;
  }

  // The carrier and the trailer can't take more than the whole.
  const merged = { ...(current ?? {}), ...values };
  const lh = toNumber(merged.linehaul_pct);
  const tr = toNumber(merged.trailer_pct);
  if (lh !== null && tr !== null && lh + tr > 1 + 1e-9)
    errors.push(
      `linehaul_pct (${lh}) + trailer_pct (${tr}) add to more than 1 — the carrier and the trailer can't take more than 100% of the linehaul`,
    );

  return { values, errors };
}
