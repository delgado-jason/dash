// ONE assembly of the cash board's input (Cockpit PR 1). The Cash Flow page and
// the owner's landing page both hand their already-fetched rows to this one
// builder and then to buildCashBoard, so "Cash on hand" on Pulse is the board's
// own figure — never a second derivation. Lifted whole from CashFlowPage; the
// arithmetic is unchanged.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { Obligation } from "@/types/obligation";
import type { SettlementSummary } from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";
import type { ExpensePeriod } from "@/types/expense";
import type { MaintenanceService } from "@/types/maintenance";
import type { PlanRow, AccountRow, SnapshotRow, OpsCheckRow } from "@/services/planService";
import type { CashAssumptionsRow } from "@/services/cashflowService";
import {
  runningWeekPace, runningMilesPace, runningAdvancePace,
  type CashBoard, type CashBoardInput, type CashCheck, type MoneyDayMove,
} from "./cashBoard";
import { deductionBuckets } from "./settlements";
import { collectReadings } from "./odometer";
import { getMoneyDay, monthName, type PlanStageInput } from "./planStatus";
import type { MissingInput } from "@/lib/integrity/require";

// The typed deposits, keyed by statement date. They lived in `localStorage`
// under "dash.cashboard.deposit-overrides" until v1.268.0 — on ONE browser, so
// a figure typed on the laptop was invisible on the phone, gone with cleared
// site data, never seen by Brandie and never in any backup, while every other
// number on this page went to Postgres. They are rows now (migration 105);
// this only shapes them for the board.
//
// A typed deposit beats a projection and never beats the feed's actual.
export const depositOverridesOf = (
  rows: { statement_date: string; amount: number }[],
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.statement_date] = r.amount;
  return out;
};

export const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// The plan in force: the active one, else the first.
export const pickPlan = (plans: PlanRow[]): PlanRow | null =>
  plans.find((p) => p.active) ?? plans[0] ?? null;

// What the board is waiting for, in the owner's words — "payroll", "payroll and
// the fuel advance". A blank input is never $0: the line that needs it refuses,
// the ending waits (Nod Sheet "The Protection Stage", call 5).
const WAITS_FOR: Record<string, string> = {
  weeklyPayroll: "payroll",
  advanceDefault: "the fuel advance",
  deductionsFallback: "the deductions",
  weeklyRevenueFallback: "the revenue fallback",
  fuelFallback: "a fill on the fuel log",
  perMile: "the plan’s $ per mile",
};
export const waitsFor = (missing: MissingInput[]): string => {
  const names = missing.map((m) => WAITS_FOR[m.key] ?? m.label);
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"];
export const blankInputs = (n: number): string => `${NUMBER_WORDS[n] ?? n} blank input${n === 1 ? "" : "s"}`;

export interface CashBoardParts {
  today: string; // the operator's LOCAL day key
  settlementDay: number | null; // null → Wednesday, the house default
  depositLag: number | null; // null → 1, the cash lands the day after
  plans: PlanRow[];
  accounts: AccountRow[];
  snapshots: SnapshotRow[];
  opsChecks: OpsCheckRow[];
  periods: ExpensePeriod[];
  loads: Load[];
  settlements: SettlementSummary[];
  fuelEntries: FuelEntry[];
  trips: Trip[];
  services: MaintenanceService[];
  obligations: Obligation[];
  assumptions: CashAssumptionsRow;
  overrides: Record<string, number>; // statement date → typed deposit
  // The home days he has PLANNED (migration 107). Every projection in a week
  // is scaled by how much of it he is still on the road. Absent → the board
  // forecasts exactly as it did before 107.
  plannedHomeDays?: readonly string[];
}

export const assembleCashBoardInput = (parts: CashBoardParts): CashBoardInput => {
  const {
    today, plans, accounts, snapshots, opsChecks, periods, loads, settlements,
    fuelEntries, trips, services, obligations, assumptions, overrides, plannedHomeDays,
  } = parts;
  const plan = pickPlan(plans);
  const floatLine = plan ? Number(plan.float_line) : null;
  // Settlement day stays Wednesday and the cash lands Thursday — the lag is a
  // schedule setting, so the board dates deposits settlement + lag.
  const settlementDay = parts.settlementDay ?? 3;
  const depositLagDays = parts.depositLag ?? 1;

  // Role resolution — the board reads ops (bills draft from it; the vault is
  // protected by design) and maintenance ("already moved"); the money day
  // needs the vault and tax balances too.
  const activeAccounts = accounts.filter((a) => a.active);
  const opsAcct = activeAccounts.find((a) => a.role === "ops") ?? null;
  const vaultAcct = activeAccounts.find((a) => a.role === "vault") ?? null;
  const maintAcct = activeAccounts.find((a) => a.role === "maintenance") ?? null;
  const taxAcct = activeAccounts.find((a) => a.role === "tax") ?? null;
  const balanceOf = (sn: SnapshotRow, accountId: string | null | undefined): number | null => {
    if (!accountId) return null;
    const b = sn.balances.find((x) => x.account_id === accountId);
    return b == null ? null : Number(b.balance);
  };

  // Settlement-feed measurements: deductions = two ex-advance buckets over the
  // last 12 settlements. Fuel = the pace of the last four pay weeks that ran.
  // Hand-set assumptions remain the FALLBACK when a measurement has no data.
  const buckets = deductionBuckets(settlements);
  const fuelPaceWeekly = runningWeekPace(fuelEntries, today);

  // Every balance the board can be measured against: a Friday snapshot (with
  // the accrual it made and the Maintenance balance that proves whether the
  // move was already taken) and every OPS NOW check.
  const checks: CashCheck[] = [];
  for (const s of snapshots) {
    const bal = balanceOf(s, opsAcct?.account_id);
    if (bal == null) continue; // a snapshot with no Ops balance can't base the board
    checks.push({
      date: s.as_of.slice(0, 10),
      balance: bal,
      kind: "snapshot",
      note: s.note,
      createdAt: s.created_at ?? null,
    });
  }
  for (const c of opsChecks) {
    checks.push({
      date: c.as_of.slice(0, 10),
      balance: Number(c.balance),
      kind: "check",
      note: c.note,
      depositLanded: c.deposit_landed ?? null,
      createdAt: c.created_at ?? null,
    });
  }

  // Every mile the truck rolls: a reading at every fill, every load's pickup
  // and delivery, and both ends of every trip log; shop visits carry the
  // truck's meter too — a fourth source for the chain.
  const readings = collectReadings(fuelEntries, loads ?? [], trips, services);
  // A normal week's miles, for projecting an open period's accrual the way
  // its deposit is projected.
  const milesPaceWeekly = runningMilesPace(readings, today);

  // null stays null — a plan with no $/mile makes the accrual refuse, never $0.
  const perMile = plan ? numOrNull(plan.maintenance_per_mile) : null;

  // A run money day's outflow: tax off the top plus the surplus that actually
  // moved, on the day of the snapshot that ran it — recomputed by the same
  // function the Plan page uses, never projected before it runs.
  const moneyDays: MoneyDayMove[] = [];
  if (plan) {
    const stages: PlanStageInput[] = plan.stages.map((s) => ({
      stage_id: s.stage_id, position: s.position, label: s.label, kind: s.kind,
      target_lo: s.target_lo, target_hi: s.target_hi, obligation: null,
    }));
    const planInput = {
      float_line: plan.float_line, stages, tax_pct: plan.tax_pct,
      maintenance_floor: plan.maintenance_floor, min_move: plan.min_move,
      objective_pct: plan.objective_pct,
    };
    for (const s of snapshots) {
      const month = s.settles_month ? s.settles_month.slice(0, 10) : null;
      if (!month) continue;
      const period = periods.find((p) => p.period_month.slice(0, 10) === month);
      if (!period || period.income_total == null || period.cogs_total == null || period.expense_total == null) continue;
      const pretax = period.income_total - period.cogs_total - period.expense_total;
      // The accrual the snapshot moved: its miles × the plan's $/mile — unknown,
      // not $0, when the snapshot stored no miles or the plan has no $/mile.
      const snapMiles = numOrNull(s.miles);
      const accrualAmount = snapMiles == null || perMile == null ? null : snapMiles * perMile;
      const md = getMoneyDay(
        {
          as_of: s.as_of.slice(0, 10),
          ops: balanceOf(s, opsAcct?.account_id),
          vault: balanceOf(s, vaultAcct?.account_id),
          maintenance: balanceOf(s, maintAcct?.account_id),
          tax: balanceOf(s, taxAcct?.account_id),
        },
        planInput,
        { month, pretaxProfit: pretax },
        accrualAmount,
        null,
      );
      if (!md) continue;
      // What the day actually moved, when the snapshot kept it (085) — never
      // re-read off a P&L that may have been edited since. Older money days
      // (before Nov 4, 2026) kept only the month tag and are recomputed.
      const stored = s.tax_moved != null ? Number(s.tax_moved) + (numOrNull(s.surplus_moved) ?? 0) : null;
      if (stored == null && accrualAmount == null) {
        // Nothing kept what the day moved and its accrual is unknown — say so.
        moneyDays.push({
          date: s.as_of.slice(0, 10),
          amount: null,
          label: `Money day · ${monthName(month)}`,
          missing: [
            snapMiles == null
              ? { key: `snapshotMiles-${s.as_of.slice(0, 10)}`, label: `the miles on the ${monthName(month)} snapshot`, fixAt: "PLAN", fixTo: "/status" }
              : { key: "perMile", label: "the plan's $ per mile", fixAt: "EDIT PLAN", fixTo: "/status" },
          ],
        });
        continue;
      }
      moneyDays.push({
        date: s.as_of.slice(0, 10),
        amount: stored ?? md.tax + (md.belowMin ? 0 : md.surplus),
        label: `Money day · ${monthName(month)}`,
      });
    }
  }
  // What each snapshot accrued, for the board's stored-miles rule and the catch-up (call 8).
  const accruals = snapshots.map((s) => ({ as_of: s.as_of.slice(0, 10), miles: s.miles, pay_week_start: s.pay_week_start }));

  return {
    today,
    settlementDay,
    depositLagDays,
    floatLine,
    checks,
    loads: loads ?? [],
    settlements,
    fuelEntries,
    obligations,
    readings,
    weeklyPayroll: numOrNull(assumptions.weekly_payroll),
    perMile,
    fuelPaceWeekly,
    milesPaceWeekly,
    // NOT the advance (v1.268.0). This is the fallback for how much fuel he
    // BURNS; the advance is what Landstar FRONTS. Wiring both to
    // `weekly_fuel_advance` made the board assume they were equal, which
    // zeroed the leftover by construction. With no measurable pace the fuel
    // line now refuses and says to log a fill — a blank is not a guess.
    fuelFallback: null,
    advanceDefault: numOrNull(assumptions.weekly_fuel_advance),
    advancePaceWeekly: runningAdvancePace(settlements, today),
    buckets,
    deductionsFallback: numOrNull(assumptions.weekly_settlement_deductions),
    weeklyRevenueFallback: numOrNull(assumptions.weekly_revenue),
    moneyDays,
    overrides,
    accruals,
    plannedHomeDays: plannedHomeDays ?? [],
  };
};

// How many lines the board counts since the Ops number — the ledger's own
// reading (CashFlowPage ledgerOf): per earlier period its deposit, card
// leftover and accrual when they are more than nothing, payroll, one line per
// day that carries a bill, and each money day.
export const sinceLineCount = (board: CashBoard): number => {
  let n = 0;
  for (const pr of board.columns[0].since) {
    if (pr.deposit) n += 1;
    if (pr.leftover && pr.leftover.amount !== 0) n += 1;
    if (pr.payroll) n += 1;
    if (pr.accrual && pr.accrual.amount !== 0) n += 1;
    n += new Set(pr.bills.map((b) => b.date)).size;
    n += pr.moneyDays.length;
  }
  return n;
};
