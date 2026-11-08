// GL-155 · Landstar's fuel-surcharge band table, pasted with its effective date.
// Pure — no database. Returns { values, errors } in the house pattern; a blank
// is never zero. The band sentences repeat frontend/src/lib/metrics/fscTable.ts
// (bandErrors) word for word, so the preview and the server agree.
import { isBlank, toNumber, isCalendarDate } from "./moneyFields.js";

const DATE_REQUIRED = "effective_from is required — the day the table starts (YYYY-MM-DD)";
const BANDS_SHAPE = "bands must be a list of { low, high, cpm }";

// "$4.00" · "$4.049" — three decimals only when the table carries them.
const priceWords = (n) => "$" + (Math.round(n * 1000) % 10 === 0 ? n.toFixed(2) : n.toFixed(3));
const bandWords = (b) =>
  b.high == null ? `${priceWords(b.low)} and up` : `${priceWords(b.low)}–${priceWords(b.high)}`;

// Number or null; a blank/garbage is "not a number", never zero.
const num = (v) => (typeof v === "boolean" ? null : toNumber(v));

// `sorted` is ascending by low.
export function bandErrors(sorted) {
  const errs = [];
  if (sorted.length < 2) errs.push("a surcharge table needs at least two bands");
  sorted.forEach((b, i) => {
    if (b.high != null && b.high < b.low) errs.push(`the band ${bandWords(b)} runs backwards`);
    if (b.cpm < 0 || b.cpm > 5)
      errs.push(`the band ${bandWords(b)} pays $${b.cpm.toFixed(2)} a mile — outside $0–$5`);
    if (b.high == null && i !== sorted.length - 1) errs.push('only the last band can run "and up"');
    const prev = sorted[i - 1];
    if (prev && prev.high != null && b.low <= prev.high)
      errs.push(`the bands ${bandWords(prev)} and ${bandWords(b)} overlap`);
  });
  return errs;
}

export function validateFscSchedule(data) {
  const d = data && typeof data === "object" ? data : {};
  const values = {};
  const errors = [];

  if (isBlank(d.effective_from)) errors.push(DATE_REQUIRED);
  else if (!isCalendarDate(d.effective_from))
    errors.push("effective_from must be a calendar day written YYYY-MM-DD");
  else values.effective_from = d.effective_from.trim();

  let bands = null;
  if (Array.isArray(d.bands)) {
    const out = [];
    for (const b of d.bands) {
      if (!b || typeof b !== "object" || Array.isArray(b)) break;
      const low = num(b.low);
      const cpm = num(b.cpm);
      const high = b.high === null ? null : num(b.high);
      if (low === null || cpm === null || (b.high !== null && high === null)) break;
      out.push({ low, high, cpm });
    }
    if (out.length === d.bands.length) bands = out;
  }
  if (bands === null) {
    errors.push(BANDS_SHAPE);
  } else {
    bands.sort((a, b) => a.low - b.low);
    const be = bandErrors(bands);
    if (be.length > 0) errors.push(...be);
    else values.bands = bands;
  }

  if (d.note !== undefined) {
    const note = d.note === null ? "" : String(d.note).trim();
    if (note.length > 200) errors.push("note is longer than 200 characters");
    else values.note = note === "" ? null : note;
  }

  return { values, errors };
}
