// General items 5b-v · Landstar's weekly fuel-surcharge scale point (the one
// header line of the Ranger report: "National Average $6.292 .86 cents per
// mile · 52% of the linehaul", plus the PADD points). Pure — no database.
// Returns { values, errors } in the house pattern; a blank is never zero.
// The UI reads the pasted line (frontend fscScale.ts) and converts cents to
// dollars; the server validates the structured point and never converts.
import { isBlank, toNumber, isCalendarDate } from "./moneyFields.js";

const num = (v) => (typeof v === "boolean" ? null : toNumber(v));
const inPrice = (n) => n !== null && n > 0 && n <= 20;
const inCpm = (n) => n !== null && n >= 0 && n <= 5;

export const WEEK_REQUIRED = "week_of is required — the report's first effective day (YYYY-MM-DD)";
export const WEEK_BAD = "week_of must be a calendar day written YYYY-MM-DD";
export const PRICE_BAD = "national_avg must be a diesel price between $0 and $20 a gallon";
export const CPM_BAD = "cents_per_mile must be between $0 and $5 a loaded mile (0.86 = 86¢)";
export const PCT_BAD = "pct_of_linehaul must be a fraction 0–5 (0.52 = 52%)";
export const REGIONS_BAD = "regions must be a list of { region, price, cpm }";
export const NOTE_LONG = "note is longer than 200 characters";

export function validateFscScalePoint(data) {
  const d = data && typeof data === "object" ? data : {};
  const values = {};
  const errors = [];

  if (isBlank(d.week_of)) errors.push(WEEK_REQUIRED);
  else if (!isCalendarDate(d.week_of)) errors.push(WEEK_BAD);
  else values.week_of = d.week_of.trim();

  const price = num(d.national_avg);
  if (!inPrice(price)) errors.push(PRICE_BAD);
  else values.national_avg = price;

  const cpm = num(d.cents_per_mile);
  if (!inCpm(cpm)) errors.push(CPM_BAD);
  else values.cents_per_mile = cpm;

  if (isBlank(d.pct_of_linehaul)) values.pct_of_linehaul = null;
  else {
    const pct = num(d.pct_of_linehaul);
    if (!inCpm(pct)) errors.push(PCT_BAD);
    else values.pct_of_linehaul = pct;
  }

  if (d.regions === undefined || d.regions === null) values.regions = [];
  else {
    let regions = null;
    if (Array.isArray(d.regions)) {
      const out = [];
      for (const r of d.regions) {
        if (!r || typeof r !== "object" || Array.isArray(r)) break;
        const name = typeof r.region === "string" ? r.region.trim() : "";
        const p = num(r.price);
        const c = num(r.cpm);
        if (name === "" || name.length > 20 || !inPrice(p) || !inCpm(c)) break;
        out.push({ region: name, price: p, cpm: c });
      }
      if (out.length === d.regions.length) regions = out;
    }
    if (regions === null) errors.push(REGIONS_BAD);
    else values.regions = regions;
  }

  if (d.note !== undefined) {
    const note = d.note === null ? "" : String(d.note).trim();
    if (note.length > 200) errors.push(NOTE_LONG);
    else values.note = note === "" ? null : note;
  }

  return { values, errors };
}
