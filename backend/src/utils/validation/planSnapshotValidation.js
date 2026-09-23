import { ValidationError } from "../error.js";

// The Friday snapshot's two optional beats, normalized at the door (#500):
//   miles          — the pay week's miles the accrual was computed from
//   pay_week_start — the (Wednesday) start of the latest pay week this
//                    snapshot accrued; every earlier closed week counts as
//                    accrued too, so a skipped Friday can't accrue twice
//   settles_month  — the month this snapshot's money day settled, as the
//                    first of that month; at most one snapshot per month
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const blank = (v) => v === undefined || v === null || v === "";

const asDate = (v, field) => {
  if (blank(v)) return null;
  const s = String(v).trim();
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)))
    throw new ValidationError(`${field} must be a YYYY-MM-DD date`);
  return s;
};

export const normalizeSnapshotExtras = ({ miles, pay_week_start, settles_month } = {}) => {
  let m = null;
  if (!blank(miles)) {
    m = Number(miles);
    if (!Number.isFinite(m) || m < 0 || m > 100000)
      throw new ValidationError("miles must be a number between 0 and 100,000");
  }

  const week = asDate(pay_week_start, "pay_week_start");
  if (m == null && week != null)
    throw new ValidationError("pay_week_start needs the miles it accrued");

  let month = null;
  if (!blank(settles_month)) {
    const s = String(settles_month).trim();
    if (MONTH_RE.test(s)) month = `${s}-01`;
    else {
      month = asDate(s, "settles_month");
      if (!month.endsWith("-01"))
        throw new ValidationError("settles_month must be the first of a month");
    }
  }

  return { miles: m, pay_week_start: week, settles_month: month };
};

// "August 2026" from '2026-08-01' — for the conflict message.
export const monthLabel = (ymd) => {
  const [y, mo] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};
