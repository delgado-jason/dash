// NET-02 · an accessorial pay-rate row, refused at the door. Pure — returns
// { values, errors }. pass_through marks a reimbursement (tolls): money handed
// back for a cost he paid, not revenue. Absent means false.
import { toNumber } from "./moneyFields.js";

export function validateAccessorialRate(data) {
  const d = data && typeof data === "object" ? data : {};
  const values = {};
  const errors = [];

  const type = typeof d.accessorial_type === "string" ? d.accessorial_type.trim() : "";
  if (!type) errors.push("accessorial_type is required");
  else values.accessorial_type = type;

  const pct = toNumber(d.pay_pct);
  if (pct === null || pct < 0 || pct > 2) errors.push("pay_pct must be a fraction between 0 and 2");
  else values.pay_pct = pct;

  if (d.pass_through === undefined) values.pass_through = false;
  else if (d.pass_through === true || d.pass_through === false) values.pass_through = d.pass_through;
  else errors.push("pass_through must be true or false");

  return { values, errors };
}
