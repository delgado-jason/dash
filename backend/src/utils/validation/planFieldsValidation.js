import { ValidationError } from "../error.js";

// The plan row's numbers, checked at the door (#500): a blank or a word would
// otherwise land as 0 or NULL and quietly stop the accrual or the tax move.
// Returns a normalized copy; fields not present pass through untouched.
const RANGES = {
  float_line: [0, 10_000_000],
  float_line_home_lo: [0, 10_000_000],
  float_line_home_hi: [0, 10_000_000],
  maintenance_weekly: [0, 1_000_000],
  tax_weekly: [0, 1_000_000],
  maintenance_per_mile: [0, 10],
  tax_pct: [0, 100],
  maintenance_floor: [0, 10_000_000],
  min_move: [0, 1_000_000],
  objective_pct: [0, 100],
};
const NULLABLE = new Set(["float_line_home_lo", "float_line_home_hi"]);
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const validatePlanFields = (fields = {}) => {
  const out = { ...fields };
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    if (!(key in out)) continue;
    const v = out[key];
    if (v === null || v === "") {
      if (NULLABLE.has(key)) { out[key] = null; continue; }
      throw new ValidationError(`${key} needs a number`);
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi)
      throw new ValidationError(`${key} must be a number between ${lo} and ${hi}`);
    out[key] = n;
  }
  if ("year" in out) {
    const y = Number(out.year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100)
      throw new ValidationError("year must be a whole year between 2000 and 2100");
    out.year = y;
  }
  if ("first_money_month" in out) {
    const s = String(out.first_money_month ?? "").trim();
    if (MONTH_RE.test(s)) out.first_money_month = `${s}-01`;
    else if (DATE_RE.test(s) && s.endsWith("-01") && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)))
      out.first_money_month = s;
    else throw new ValidationError("first_money_month must be the first of a month (YYYY-MM or YYYY-MM-01)");
  }
  return out;
};
