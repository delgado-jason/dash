// GL-136 · per-diem rate rows (a dated rate: the day the IRS rate changes).
// Pure — no database. Returns { values, errors } in the house pattern; a blank
// is never zero. Future start dates are allowed (the IRS publishes ahead).
import { isBlank, toNumber, isCalendarDate } from "./moneyFields.js";

export function validatePerDiemRate(data, { partial = false } = {}) {
  const d = data && typeof data === "object" ? data : {};
  const values = {};
  const errors = [];

  if (d.effective_from === undefined && !partial) {
    errors.push("effective_from is required — the day the rate starts (YYYY-MM-DD)");
  } else if (d.effective_from !== undefined) {
    if (isBlank(d.effective_from) && !partial) {
      errors.push("effective_from is required — the day the rate starts (YYYY-MM-DD)");
    } else if (!isCalendarDate(d.effective_from)) {
      errors.push("effective_from must be a calendar day written YYYY-MM-DD");
    } else {
      values.effective_from = d.effective_from.trim();
    }
  }

  if (d.rate === undefined && !partial) {
    errors.push("rate is required — a blank would read as no per diem");
  } else if (d.rate !== undefined) {
    if (isBlank(d.rate)) {
      errors.push("rate is required — a blank would read as no per diem");
    } else {
      const n = toNumber(d.rate);
      if (n === null || n < 1 || n > 500) errors.push("rate must be between $1 and $500 a day");
      else values.rate = Math.round(n * 100) / 100;
    }
  }

  if (d.note !== undefined) {
    const note = d.note === null ? "" : String(d.note).trim();
    if (note.length > 200) errors.push("note is longer than 200 characters");
    else values.note = note === "" ? null : note;
  }

  return { values, errors };
}
