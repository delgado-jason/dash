import { isBlank, toNumber, isCalendarDate } from "./moneyFields.js";

// CASH-16 · obligations (the bills and draws the money calendar places),
// refused at the door.
//   amount                       finite, ≥ 0
//   draft_amount, balances       finite ≥ 0, or null
//   balance_as_of, payoff_date   a real YYYY-MM-DD, or null
//   day_of_month                 whole day 1–31; an ACTIVE bill needs one
//   is_draw && on_pl             refused — a draw is never an operating cost
//
// `partial` is the PATCH: only the fields present are checked and returned.
// A patch may change `active` or `day_of_month` alone, so the cross-field
// rules read the merged picture — pass the stored row as `existing`
// ({active, is_draw, on_pl, day_of_month}); without it a patch is judged on
// what it carries. A create is always active (the column's default).
const MONEY_NON_NEG = ["draft_amount", "original_balance", "current_balance"];
const DATE_FIELDS = ["balance_as_of", "payoff_date"];
const AMOUNT_SENTENCE = "amount needs a number — a blank or text can't go on the money calendar";

export const validateObligation = (data, { partial = false, existing = null } = {}) => {
  const d = data ?? {};
  const values = {};
  const errors = [];
  const has = (f) => d[f] !== undefined;

  if (has("amount")) {
    const n = toNumber(d.amount);
    if (n == null) errors.push(AMOUNT_SENTENCE);
    else if (n < 0) errors.push("amount can't be negative");
    else values.amount = n;
  } else if (!partial) {
    errors.push(AMOUNT_SENTENCE);
  }

  for (const f of MONEY_NON_NEG) {
    if (!has(f)) continue;
    if (isBlank(d[f])) {
      values[f] = null;
      continue;
    }
    const n = toNumber(d[f]);
    if (n == null) errors.push(`${f} must be a number, or left empty`);
    else if (n < 0) errors.push(`${f} can't be negative`);
    else values[f] = n;
  }

  for (const f of DATE_FIELDS) {
    if (!has(f)) continue;
    if (isBlank(d[f])) {
      values[f] = null;
      continue;
    }
    if (!isCalendarDate(d[f])) errors.push(`${f} must be a real YYYY-MM-DD date, or left empty`);
    else values[f] = String(d[f]).trim();
  }

  let dayRefused = false;
  if (has("day_of_month")) {
    if (isBlank(d.day_of_month)) values.day_of_month = null;
    else {
      const n = toNumber(d.day_of_month);
      if (n == null || !Number.isInteger(n) || n < 1 || n > 31) {
        errors.push("day_of_month must be a whole day, 1–31");
        dayRefused = true;
      } else values.day_of_month = n;
    }
  }

  // ---- cross-field, on the merged picture ----
  const ex = existing ?? {};
  const merged = (f) => (has(f) ? d[f] : ex[f]);
  const active = partial ? merged("active") : d.active !== false;
  const dayKnown = !partial || has("day_of_month") || "day_of_month" in ex;
  const dayRaw = merged("day_of_month");
  const dayN = isBlank(dayRaw) ? null : toNumber(dayRaw);
  const dayOk = dayN != null && Number.isInteger(dayN) && dayN >= 1 && dayN <= 31;
  if (active === true && dayKnown && !dayOk && !dayRefused)
    errors.push("an active bill needs its draft day (1–31) or the money calendar can't place it");

  if (merged("is_draw") === true && merged("on_pl") === true)
    errors.push("a draw is never an operating cost — it can't also be on the P&L");

  return { values, errors };
};
