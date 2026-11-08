import { toNumber, isCalendarDate, dollars, withinCents } from "./moneyFields.js";

// The DTS server's settlement feed, refused at the door. Pure: returns the
// list of refusals ([] = fine).
//   period_ending   a real calendar date that falls on the schedule's
//                   settlement_day (0 Sunday … 6 Saturday; Wednesday = 3)
//   header revenue / deductions   equal the Σ of the lines within $0.01
//                   (a parser guard moved to the server; a line with no value
//                   counts as zero)
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const validateSettlementIngest = ({
  period_ending,
  revenue,
  deductions,
  lines,
  settlement_day = 3,
} = {}) => {
  const errors = [];

  if (!isCalendarDate(period_ending)) {
    errors.push(`period_ending ${period_ending} isn't a real calendar date`);
  } else {
    const dow = new Date(`${period_ending}T00:00:00Z`).getUTCDay();
    if (dow !== Number(settlement_day))
      errors.push(
        `period_ending ${period_ending} is a ${DAYS[dow]} — your settlements land on ${DAYS[Number(settlement_day)]}; check the statement date or the schedule in Settings`,
      );
  }

  const sum = (key) =>
    (Array.isArray(lines) ? lines : []).reduce((s, l) => s + (toNumber(l?.[key]) ?? 0), 0);
  const rev = toNumber(revenue);
  const ded = toNumber(deductions);
  if (rev != null && !withinCents(sum("revenue"), rev))
    errors.push(
      `the statement's revenue says ${dollars(rev)} but its lines add to ${dollars(sum("revenue"))} — the file didn't parse cleanly`,
    );
  if (ded != null && !withinCents(sum("deductions"), ded))
    errors.push(
      `the statement's deductions say ${dollars(ded)} but its lines add to ${dollars(sum("deductions"))} — the file didn't parse cleanly`,
    );

  return errors;
};
