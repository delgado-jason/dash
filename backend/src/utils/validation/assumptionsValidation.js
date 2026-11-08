import { toNumber } from "./moneyFields.js";

// CASH-16 · the cash-flow planning assumptions, refused at the door. Every
// field that arrives must be a finite, non-blank number — a null payroll would
// read as $0 and drop a week's payroll from the board. Partial like the PATCH:
// only fields present are checked and returned (normalized to numbers).
//   rates     fed_tax_rate, state_tax_rate     0–1 (15% is 0.15)
//   dollars   weekly_payroll, weekly_revenue, weekly_fuel_advance,
//             weekly_settlement_deductions, monthly_depreciation,
//             tax_catchup_owed                 ≥ 0
//   financing_floor                            any finite number (it is the
//                                              principal paid down, so it is
//                                              entered negative)
export const RATE_FIELDS = ["fed_tax_rate", "state_tax_rate"];
export const NON_NEGATIVE_FIELDS = [
  "weekly_payroll",
  "weekly_revenue",
  "weekly_fuel_advance",
  "weekly_settlement_deductions",
  "monthly_depreciation",
  "tax_catchup_owed",
];
export const ASSUMPTION_FIELDS = [
  "weekly_revenue",
  "weekly_payroll",
  "monthly_depreciation",
  "fed_tax_rate",
  "state_tax_rate",
  "financing_floor",
  "tax_catchup_owed",
  "weekly_fuel_advance",
  "weekly_settlement_deductions",
];

export const validateAssumptions = (data) => {
  const values = {};
  const errors = [];
  const d = data ?? {};
  for (const f of ASSUMPTION_FIELDS) {
    if (d[f] === undefined) continue;
    const n = toNumber(d[f]);
    if (n == null) {
      errors.push(`${f} needs a number — a blank would read as $0`);
      continue;
    }
    if (RATE_FIELDS.includes(f) && (n < 0 || n > 1)) {
      errors.push(`${f} is a fraction — 15% is 0.15`);
      continue;
    }
    if (NON_NEGATIVE_FIELDS.includes(f) && n < 0) {
      errors.push(`${f} can't be negative`);
      continue;
    }
    values[f] = n;
  }
  return { values, errors };
};
