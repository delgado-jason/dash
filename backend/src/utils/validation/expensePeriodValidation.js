import { toNumber, isCalendarDate, dollars, withinCents } from "./moneyFields.js";

// PNL-03/04/05 · a P&L month, refused at the door. Pure: returns the list of
// refusals ([] = fine). The server re-reconciles what the UI already checks:
//   period_month   a real first-of-month date (a mid-month date would create a
//                  second row for the same month)
//   line.amount    a finite number
//   line.section   cogs, expenses or income (absent = expenses, the default)
//   the lines      sum to the file's totals within $0.01, per section
//                  (cogs_total, expense_total)
export const SECTIONS = ["cogs", "expenses", "income"];

const monthName = (ymd) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

export const validateExpensePeriod = ({ period_month, totals, lines } = {}) => {
  const errors = [];

  if (!isCalendarDate(period_month)) {
    errors.push("period_month must be a real YYYY-MM-DD date — the first of the month");
  } else {
    const ymd = String(period_month).trim();
    if (!ymd.endsWith("-01"))
      errors.push(`a P&L month is the 1st — ${ymd} would create a second ${monthName(ymd)}`);
  }

  const sums = { cogs: 0, expenses: 0 };
  let linesClean = true;
  (Array.isArray(lines) ? lines : []).forEach((line, i) => {
    const who = `line ${i + 1}${line?.category ? ` (${line.category})` : ""}`;
    const amount = toNumber(line?.amount);
    if (amount == null) {
      errors.push(`${who} needs a numeric amount`);
      linesClean = false;
    }
    const section = line?.section ?? "expenses";
    if (!SECTIONS.includes(section)) {
      errors.push(`${who} has section '${section}' — a P&L line is cogs, expenses or income`);
      linesClean = false;
    }
    if (amount != null && section in sums) sums[section] += amount;
  });

  // Reconcile only when every line is readable — otherwise the sum is noise.
  if (linesClean) {
    const t = totals ?? {};
    const cogs = toNumber(t.cogs_total);
    const exp = toNumber(t.expense_total);
    if (cogs != null && !withinCents(sums.cogs, cogs))
      errors.push(
        `Cost of goods sold lines add to ${dollars(sums.cogs)} but the file's total says ${dollars(cogs)} — re-export the P&L`,
      );
    if (exp != null && !withinCents(sums.expenses, exp))
      errors.push(
        `Expense lines add to ${dollars(sums.expenses)} but the file's total says ${dollars(exp)} — re-export the P&L`,
      );
  }

  return errors;
};
