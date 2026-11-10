// CASH ON HAND, TODAY — the Ops number walked forward by every counted line
// dated up to today, and no further (Nod Sheet "The Cockpit", band 1).
//
// The cash board's current column ENDS after the period's last line (the
// deposit that lands once the period closes), which is Tuesday's money, not
// this morning's. The plate leads with this morning's: the column's opening
// (the number itself, or the number after the prior periods' lines), plus the
// current period's counted lines whose own date is on or before today. The
// same lines, the same amounts, the same `counted` verdicts the board already
// decided — nothing is re-derived here, only cut at today.
//
// A blank is never zero: when the column's opening is missing, or a counted
// line that falls on or before today is refused (its amount null), the figure
// is null and the board's own `missing` names what is unset.
import type { CashBoard, PriorLines } from "@/lib/metrics/cashBoard";

export interface CashToday {
  amount: number | null;
  linesSince: number; // counted lines folded into the figure, prior periods included
  missing: CashBoard["missing"];
}

interface Dated {
  amount: number | null;
  date: string;
  counted: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const priorLineCount = (p: PriorLines): number =>
  (p.payroll ? 1 : 0) +
  (p.accrual ? 1 : 0) +
  (p.leftover ? 1 : 0) +
  (p.deposit && p.deposit.counted ? 1 : 0) +
  p.bills.length +
  p.moneyDays.length;

export const cashAsOf = (board: CashBoard, today: string): CashToday => {
  const col = board.columns[0];
  const refused: CashToday = { amount: null, linesSince: 0, missing: col.missing.length ? col.missing : board.missing };
  if (col.opening == null) return refused;

  let amount = col.opening;
  let lines = 0;
  // The prior periods' lines are all dated before this period began.
  for (const p of col.since) {
    if (p.total == null) return refused;
    amount += p.total;
    lines += priorLineCount(p);
  }

  // A counted line on or before today moves the figure; a refused one stops it.
  const take = (l: Dated | null | undefined, sign: 1 | -1): boolean => {
    if (!l || !l.counted || l.date > today) return true;
    if (l.amount == null) return false;
    amount += sign * l.amount;
    lines += 1;
    return true;
  };
  // EVERY column, not just the current one (v1.268.0). For TODAY this changes
  // nothing — today always falls inside the current column, so the next one has
  // no line dated on or before it. It matters when the figure is asked for a
  // LATER day: a period's accrual pays the Friday after it closes, inside the
  // next period's week, and that Friday is also the next period's payroll day.
  // Walking one column would say the bank holds money that payroll has already
  // taken — the same thing the cash board's ending used to do, and the reason
  // Jason could not trust it. One date, one answer, on both surfaces.
  const ok = board.columns.every(
    (c) =>
      take(c.prevDeposit, 1) &&
      take(c.deposit, 1) &&
      take(c.payroll, -1) &&
      take(c.accrual, -1) &&
      take(c.catchUp, -1) &&
      take(c.fuel.leftover, 1) &&
      c.bills.every((b) => take(b, -1)) &&
      c.moneyDays.every((m) => take(m, -1)),
  );
  if (!ok) return { ...refused, linesSince: lines };

  return { amount: round2(amount), linesSince: lines, missing: [] };
};
