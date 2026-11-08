import { ValidationError } from "../error.js";

// The snapshot's optional beats, normalized at the door (#500; the guards
// made real 2026-11-04, Nod Sheet §4 · 5):
//   as_of          — today or earlier, never a day that hasn't happened (a
//                    future date used to accrue weeks nobody had driven)
//   miles          — the pay week's miles the accrual was computed from
//   pay_week_start — the (Wednesday) start of the latest pay week this
//                    snapshot accrued; every earlier closed week counts as
//                    accrued too, so a skipped Friday can't accrue twice
//   settles_month  — the month this snapshot's money day settled, as the
//                    first of that month; at most one snapshot per month; the
//                    month must have closed before as_of, and the money day
//                    never runs on the month's first Friday
//   tax_moved · surplus_moved · objective_moved · household_moved — what the
//                    money day moved (085); only with settles_month, never
//                    negative
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

const utcDayKey = (d) => d.toISOString().slice(0, 10);

// The far edge of "today". The server's zone is not the owner's (Railway runs
// UTC, the business is Central), so the ceiling is UTC-today + 1: a full day
// of slack, which is what a Central evening needs and still refuses a month
// mis-picked in the native date picker.
const tomorrowKey = (now) => utcDayKey(new Date(Date.parse(`${utcDayKey(now)}T00:00:00Z`) + 86_400_000));

// The month's first Friday — the new month's Friday: the snapshot and the
// accrual run, the money day never does.
export const isFirstFriday = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.getUTCDay() === 5 && d.getUTCDate() <= 7;
};

const asMoved = (v, field) => {
  if (blank(v)) return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000)
    throw new ValidationError(`${field} must be a number between 0 and 10,000,000`);
  return Math.round(n * 100) / 100;
};

// "Nov 6" — for the refusals.
const dayWords = (ymd) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const normalizeSnapshotExtras = (
  { as_of, miles, pay_week_start, settles_month, tax_moved, surplus_moved, objective_moved, household_moved } = {},
  now = new Date(),
) => {
  // as_of is required upstream; here it is checked for shape and for the clock.
  const day = asDate(as_of, "as_of");
  if (day != null && day > tomorrowKey(now))
    throw new ValidationError("a snapshot can only be dated today or earlier");

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
    if (day != null) {
      // The month must have closed: its money day can't run inside it.
      if (month.slice(0, 7) >= day.slice(0, 7))
        throw new ValidationError(`${monthLabel(month)} hasn't closed — a month settles once it is over`);
      if (isFirstFriday(day))
        throw new ValidationError(`${dayWords(day)} is the month's first Friday — the money day runs any other day`);
    }
  }

  const moves = {
    tax_moved: asMoved(tax_moved, "tax_moved"),
    surplus_moved: asMoved(surplus_moved, "surplus_moved"),
    objective_moved: asMoved(objective_moved, "objective_moved"),
    household_moved: asMoved(household_moved, "household_moved"),
  };
  if (month == null && Object.values(moves).some((v) => v != null))
    throw new ValidationError("a moved amount needs the month its money day settled");

  return { as_of: day, miles: m, pay_week_start: week, settles_month: month, ...moves };
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

// PLAN-07 · a snapshot's balances against the plan's accounts. Pure: returns
// the list of refusals ([] = fine).
//   - every ACTIVE account needs a balance (a missing one would read as $0)
//   - one balance per account (a duplicate is two answers to one question)
//   - every balance names an account of this plan
// `accounts` is the user's plan_accounts: [{account_id, name, active}].
export const validateSnapshotBalances = (balances, accounts = []) => {
  const errors = [];
  const byId = new Map(accounts.map((a) => [String(a.account_id), a]));
  const label = (id) => byId.get(String(id))?.name ?? String(id);

  const seen = new Set();
  for (const b of Array.isArray(balances) ? balances : []) {
    const id = String(b?.account_id);
    if (!byId.has(id)) {
      errors.push("a balance names an account that isn't in your plan");
      continue;
    }
    if (seen.has(id)) errors.push(`this snapshot lists ${label(id)} twice — one balance per account`);
    seen.add(id);
  }

  for (const a of accounts) {
    if (a.active !== false && !seen.has(String(a.account_id)))
      errors.push(`this snapshot has no balance for ${a.name} — type it or mark the account inactive`);
  }
  return errors;
};
