// Turns a loan/lease obligation into the "own it outright" tracker: how much is
// left, how far along, and when it's free-and-clear. Where the contract gives a
// real end date (payoff_date) the payoff is exact; otherwise it's estimated at
// the current payment pace. Pure; take `now` explicitly so it's testable.
//
// The balance on file is a STATEMENT balance read on balance_as_of. Every
// monthly draft since that day paid principal (loan rows carry amount =
// principal — types/obligation.ts), so what's owed TODAY is the statement
// balance less those drafts. The trackers and the Debt Crusher medal used to
// show the July balance in November (Nod Sheet 2026-11-04, §5 "Loan balances").
import type { Obligation } from "@/types/obligation";

export interface Payoff {
  owed: number; // what's left TODAY — the statement balance less the drafts since it was read
  statementOwed: number; // the balance as the statement read it (current_balance)
  balanceAsOf: string | null; // the day that balance was read, 'YYYY-MM-DD'
  draftsSince: number; // monthly drafts out the door since that day
  original: number | null; // starting balance (for the % owned)
  paidPct: number | null; // 0..1 owned so far; null when no original recorded
  monthlyPayment: number;
  paymentsLeft: number | null; // months to $0
  payoffDate: string | null; // 'YYYY-MM-DD'
  isPaidOff: boolean;
  exact: boolean; // true when payoffDate came from the contract, not an estimate
}

// A debt obligation is "trackable" for payoff once it carries a current balance.
export const isPayoffTracked = (o: Obligation): boolean =>
  o.current_balance != null;

// The paid-off state of the loan tracked against an asset type — feeds the
// Free & Clear / Trailer Paid Off trophy engine. null when nothing is tracked.
export const assetLoanStatus = (
  obligations: Obligation[],
  assetType: "truck" | "trailer",
  now: Date,
): { paidOff: boolean; ownedPct: number | null; owed: number } | null => {
  const o = obligations.find((x) => x.asset_type === assetType && isPayoffTracked(x));
  if (!o) return null;
  const p = computePayoff(o, now);
  return { paidOff: p.isPaidOff, ownedPct: p.paidPct, owed: p.owed };
};

const parseUTC = (d: string): Date => new Date(d.slice(0, 10) + "T00:00:00Z");

const addMonths = (from: Date, n: number): Date =>
  new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, from.getUTCDate()));

const monthsBetween = (from: Date, to: Date): number =>
  Math.max(
    0,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth()),
  );

// Monthly drafts that have come out since the balance was read: one per
// calendar month on the draft day (day_of_month, else the as-of day; clamped
// to a short month's last day), strictly after the as-of day and on or before
// `now`. Day keys throughout — a DATE column is a UTC midnight.
export const draftsSinceBalance = (
  o: Pick<Obligation, "balance_as_of"> & Partial<Pick<Obligation, "day_of_month">>,
  now: Date,
): number => {
  if (!o.balance_as_of) return 0;
  const asOf = String(o.balance_as_of).slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  if (today <= asOf) return 0;
  const draftDay = o.day_of_month ?? Number(asOf.slice(8, 10));
  const y0 = Number(asOf.slice(0, 4));
  const m0 = Number(asOf.slice(5, 7)) - 1;
  let n = 0;
  for (let k = 0; k < 600; k++) {
    const first = new Date(Date.UTC(y0, m0 + k, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const key = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(draftDay, lastDay)))
      .toISOString()
      .slice(0, 10);
    if (key > today) break;
    if (key > asOf) n++;
  }
  return n;
};

export const computePayoff = (o: Obligation, now: Date): Payoff => {
  const statementOwed = Math.max(0, Number(o.current_balance ?? 0));
  const original = o.original_balance != null ? Number(o.original_balance) : null;
  const monthlyPayment = Number(o.amount) || 0;
  const draftsSince = draftsSinceBalance(o, now);
  const owed = Math.max(0, statementOwed - draftsSince * monthlyPayment);
  const isPaidOff = owed <= 0;

  const paidPct =
    original && original > 0
      ? Math.max(0, Math.min(1, (original - owed) / original))
      : null;

  let payoffDate: string | null = null;
  let paymentsLeft: number | null = null;
  let exact = false;

  if (isPaidOff) {
    paymentsLeft = 0;
  } else if (o.payoff_date) {
    // Contract end / maturity — the real date, no interest math needed.
    payoffDate = o.payoff_date.slice(0, 10);
    paymentsLeft = monthsBetween(now, parseUTC(o.payoff_date));
    exact = true;
  } else if (monthlyPayment > 0) {
    // No end date on file — estimate at the current payment pace.
    paymentsLeft = Math.ceil(owed / monthlyPayment);
    payoffDate = addMonths(now, paymentsLeft).toISOString().slice(0, 10);
  }

  return {
    owed,
    statementOwed,
    balanceAsOf: o.balance_as_of ? String(o.balance_as_of).slice(0, 10) : null,
    draftsSince,
    original,
    paidPct,
    monthlyPayment,
    paymentsLeft,
    payoffDate,
    isPaidOff,
    exact,
  };
};
