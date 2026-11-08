// THE LEAVE RESERVE — how many weeks the truck can sit while the household and
// the truck stay whole (Nod Sheet "The Cockpit", band 4, call 5 lean A).
//
//   weekly burn   = the weekly payroll + the sit cost of a parked truck per week
//                   (fixed costs and the notes — lib/metrics/sitRun, the same
//                   figure the Expenses page prints)
//   weeks covered = the Vault ÷ the weekly burn
//   target        = the horizon in weeks (plans.leave_weeks) × the weekly burn
//
// Nothing is netted off for settlements still to land: a reserve you can only
// spend if a check arrives is not a reserve. A blank is never zero: a missing
// payroll, basis, balance or horizon yields null and is named with where to
// set it.
import type { SitRun } from "./sitRun";
import type { MissingInput } from "@/lib/integrity/require";
import { FIX_SNAPSHOT } from "./planStatus";

export interface LeaveReserveInput {
  vault: number | null; // the Vault's typed balance on the latest snapshot
  weeklyPayroll: number | null; // cash_assumptions.weekly_payroll
  sit: SitRun | null; // burnFromPeriods over the basis window
  weeks: number | null; // plans.leave_weeks
}

export interface LeaveReserve {
  weeklyBurn: number | null;
  weeksCovered: number | null; // one decimal
  target: number | null;
  pct: number | null; // vault ÷ target, unclamped
  missing: MissingInput[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const leaveReserve = (i: LeaveReserveInput): LeaveReserve => {
  const missing: MissingInput[] = [];
  if (i.weeklyPayroll == null)
    missing.push({ key: "weekly_payroll", label: "the weekly payroll", fixAt: "ASSUMPTIONS", fixTo: "/cashflow" });
  if (i.sit == null)
    missing.push({ key: "basis", label: "a filed P&L month for the cost basis", fixAt: "EXPENSES", fixTo: "/expenses" });
  if (i.vault == null)
    missing.push({ key: "balance_vault", label: "the Vault balance", fixAt: FIX_SNAPSHOT, fixTo: "/status" });
  if (i.weeks == null)
    missing.push({ key: "leave_weeks", label: "the leave horizon", fixAt: "EDIT PLAN", fixTo: "/status" });

  const weeklyBurn = i.weeklyPayroll != null && i.sit != null ? round2(i.weeklyPayroll + i.sit.sitWeekly) : null;
  const target = weeklyBurn != null && i.weeks != null ? round2(weeklyBurn * i.weeks) : null;
  const weeksCovered =
    weeklyBurn != null && weeklyBurn > 0 && i.vault != null ? Math.round((i.vault / weeklyBurn) * 10) / 10 : null;
  const pct = target != null && target > 0 && i.vault != null ? i.vault / target : null;
  return { weeklyBurn, weeksCovered, target, pct, missing };
};
