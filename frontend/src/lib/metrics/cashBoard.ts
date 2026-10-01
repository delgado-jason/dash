// THE CASH BOARD — two pay periods, each the money it earns against what it
// carries (Jason, 2026-10-01, answered question by question):
//
//   "All I need is the current week I'm running and the next week after
//   that." A pay period runs Wednesday → Tuesday. Whatever it delivers goes on
//   the NEXT Wednesday's statement and lands in the bank Thursday — and that
//   money belongs to the period that earned it, so each column shows its own
//   deposit: delivered loads minus Landstar's cut plus accessorials, minus
//   the fuel advances drawn in the period (borrowed against those loads —
//   $2,000 a week unless the fills pass it; the statement's actual once it's
//   in the vault), minus the small fixed deductions. A load still on the road
//   is EXPECTED, never delivered.
//   Fuel is paid from the card the advance lands on, so the fills never come
//   out of Ops; what's left on the card after the fills goes to business
//   checking every MONDAY. Payroll is the fixed weekly figure, Friday. The
//   accrual is the period's own miles, Wednesday → Tuesday, by odometer, paid
//   the Friday after the period closes. Bills draft on their days. A run money
//   day leaves Ops on its day.
//   "Whenever I update my ops number, any expenses that come out on a date
//   that's on that date or after that date should get subtracted" — the
//   current column opens on the latest balance typed (OPS NOW or the Friday
//   snapshot); everything dated before it is already inside the number and is
//   shown but not counted. The previous period's deposit, landing on the
//   Thursday inside the current period, is added when it lands after that
//   number. The bottom carries to the next column as its opening.
//   No gap line. Dates are the #1 bug: every date is a sliced calendar day.
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import type { SettlementSummary } from "@/types/settlement";
import { expectedPayDate, nextDraftDate } from "./cashflow";
import { isFirstOfMonth, type DeductionBuckets } from "./settlements";
import { loadNetRevenue } from "./rateTargets";
import { payWeekOf, milesInWeeks, weekLabel, type PayWeek } from "./payWeeks";
import { weekOdometerMiles, addDays, readingWords, IMPLAUSIBLE_WEEK_MI, type OdometerReading } from "./odometer";
import { accrualFlagOf } from "./planStatus";

export interface CashCheck {
  date: string; // YYYY-MM-DD
  balance: number; // the bank's Ops balance
  kind: "snapshot" | "check";
  note: string | null;
  settlesMonth?: string | null; // a snapshot that ran a money day
}

export interface FuelLike {
  fuel_date: string;
  gallons: number | string;
  price_per_gallon: number | string;
}

export interface MoneyDayMove {
  date: string; // the snapshot's day
  amount: number; // what left Ops: tax + the surplus that moved
  label: string; // "Money day · August 2026"
}

export interface CashBoardInput {
  today: string; // the operator's LOCAL day key
  settlementDay: number; // 0–6; 3 = Wednesday
  depositLagDays: number; // 1 = the cash lands Thursday
  floatLine: number | null;
  checks: CashCheck[];
  loads: Load[];
  settlements: SettlementSummary[];
  fuelEntries: FuelLike[];
  obligations: Obligation[];
  readings: OdometerReading[];
  weeklyPayroll: number;
  perMile: number; // the plan's maintenance $/mile
  fuelPaceWeekly: number | null; // the 30-day pace; null → fuelFallback
  fuelFallback: number;
  advanceDefault: number; // the weekly fuel advance borrowed against the loads — $2,000
  buckets: DeductionBuckets;
  deductionsFallback: number;
  weeklyRevenueFallback: number; // when nothing is booked into a period yet
  moneyDays: MoneyDayMove[];
  overrides: Record<string, number>; // statement date → deposit
}

// A dated line. `counted` = it comes off (or goes into) the column's Ops:
// dated on or after the Ops number in the current column, always in the next.
export interface Line {
  amount: number;
  date: string;
  counted: boolean;
}

export interface DepositLine extends Line {
  week: PayWeek; // the period that earned it
  statementDate: string;
  source: "actual" | "override" | "projected" | "fallback";
  loads: number; // delivered — status says so
  loadsNet: number;
  inTransit: number;
  booked: number;
  expectedNet: number;
  advances: number; // drawn in the period — the statement's actual, else assumed
  // actual = the statement · assumed = the $2,000 you borrow · fills = the
  // logged fills passed it · pace = the projected fuel at the 30-day pace passes it
  advancesSource: "actual" | "assumed" | "fills" | "pace";
  bucket: number;
  bucketKind: "first" | "standard" | "fallback";
}

export interface FuelLine {
  spent: number; // the period's fills — actual once closed, projected while open
  spentSource: "actual" | "pace";
  fills: number;
  soFar: number;
  advances: number;
  advancesSource: DepositLine["advancesSource"];
  leftover: Line; // advances − spent → Ops, the Monday inside the period
}

export interface AccrualLine extends Line {
  miles: number | null;
  source: "odometer" | "loads" | "none";
  words: string | null;
  flag: string | null;
}

export interface BillLine {
  label: string;
  amount: number;
  date: string;
  counted: boolean;
}

export interface PeriodColumn {
  key: "current" | "next";
  week: PayWeek;
  state: "open" | "future";
  opening: number | null;
  prevDeposit: DepositLine | null; // last period's money landing inside this period — current column only
  deposit: DepositLine; // this period's own, landing after it closes
  payroll: Line;
  accrual: AccrualLine;
  fuel: FuelLine;
  bills: BillLine[];
  billsTotal: number; // counted only
  moneyDays: (MoneyDayMove & { counted: boolean })[];
  ending: number | null;
}

export interface CashBoard {
  columns: [PeriodColumn, PeriodColumn];
  base: CashCheck; // the Ops number the current column opens on
  lowest: number | null; // the lower of the two endings
  clears: boolean | null;
}

// A load has DELIVERED when its status says so — never on a planned date.
const DELIVERED = new Set(["delivered", "invoiced", "paid"]);

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const day = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);
const dow = (k: string): number => new Date(`${k}T00:00:00Z`).getUTCDay();
const round2 = (n: number): number => Math.round(n * 100) / 100;
const fmtMiles = (n: number): string => Math.round(n).toLocaleString("en-US");
const mdWords = (k: string): string =>
  new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// The first settlement day strictly after a pay period closes — its statement.
export const statementDateOf = (week: PayWeek, settlementDay: number): string => {
  const sd = Number.isInteger(settlementDay) && settlementDay >= 0 && settlementDay <= 6 ? settlementDay : 3;
  let d = addDays(week.end, 1);
  while (dow(d) !== sd) d = addDays(d, 1);
  return d;
};
// The first given weekday on or after a day.
const nextDow = (from: string, target: number): string => {
  let d = from;
  while (dow(d) !== target) d = addDays(d, 1);
  return d;
};

// ---- fuel ----

const fillsIn = (fuel: FuelLike[], week: PayWeek, upTo?: string): { total: number; count: number } => {
  let total = 0;
  let count = 0;
  const end = upTo && upTo < week.end ? upTo : week.end;
  for (const f of fuel) {
    const d = day(f.fuel_date);
    if (d >= week.start && d <= end) {
      total += num(f.gallons) * num(f.price_per_gallon);
      count++;
    }
  }
  return { total: round2(total), count };
};

// The period's fuel: the log's fills once the period closes; while it's open,
// the fills so far or the 30-day pace, whichever is larger; a future period
// at the pace. The advance drawn against the period's loads: the statement's
// actual once it's in the vault, else $2,000 unless the fills pass it. What's
// left on the card after the fills goes to Ops on the Monday inside the period.
export const fuelForWeek = (
  input: Pick<CashBoardInput, "fuelEntries" | "today" | "fuelPaceWeekly" | "fuelFallback" | "advanceDefault" | "settlements" | "settlementDay">,
  week: PayWeek,
  base?: string,
): FuelLine => {
  const paceWeekly = input.fuelPaceWeekly ?? input.fuelFallback;
  const closed = week.end < input.today;
  const { total, count } = closed ? fillsIn(input.fuelEntries, week) : fillsIn(input.fuelEntries, week, input.today);
  const spent = closed ? total : Math.max(paceWeekly, total);
  const statementDate = statementDateOf(week, input.settlementDay);
  const actual = input.settlements.find((s) => day(s.period_ending) === statementDate);
  const advancesActual = actual ? num(actual.advances) : null;
  const advances = advancesActual ?? Math.max(input.advanceDefault, spent);
  const advancesSource: FuelLine["advancesSource"] =
    advancesActual != null ? "actual" : spent <= input.advanceDefault ? "assumed" : total > input.advanceDefault ? "fills" : "pace";
  const monday = nextDow(week.start, 1);
  return {
    spent, spentSource: closed ? "actual" : "pace", fills: count, soFar: total,
    advances, advancesSource,
    leftover: { amount: round2(Math.max(0, advances - spent)), date: monday, counted: base == null || monday >= base },
  };
};

// ---- a period's own deposit ----

export const depositForWeek = (input: CashBoardInput, week: PayWeek, base?: string): DepositLine => {
  const { settlements, loads, overrides, buckets, deductionsFallback, weeklyRevenueFallback, today } = input;
  const statementDate = statementDateOf(week, input.settlementDay);
  const date = addDays(statementDate, input.depositLagDays);
  // A deposit is there by morning. A balance typed the day it lands already
  // holds it (Jason: "if you type after it landed, it's already in your
  // number"), so a deposit counts only when it lands strictly AFTER the Ops
  // number; an expense dated the same day still comes off ("on that date or
  // after that date").
  const counted = base == null || date > base;
  const fuel = fuelForWeek(input, week, base);
  const first = isFirstOfMonth(statementDate);
  const bucketVal = first ? (buckets.firstOfMonth ?? buckets.standard) : (buckets.standard ?? buckets.firstOfMonth);
  const bucket = bucketVal ?? deductionsFallback;
  const bucketKind: DepositLine["bucketKind"] = bucketVal == null ? "fallback" : first ? "first" : "standard";

  let loadsNet = 0;
  let count = 0;
  let inTransit = 0;
  let booked = 0;
  let expectedNet = 0;
  const closed = week.end < today;
  // Delivered means the status says so. A load still on the road with a
  // planned delivery date is expected, and only into a period that hasn't
  // closed. dash's payment flag is NOT consulted — Jason marks loads paid by
  // hand the morning the cash lands, often before the statement reaches the
  // vault; the statement's actual below wins the moment it's on file.
  for (const l of loads) {
    if (l.load_status === "cancelled") continue;
    const isDelivered = DELIVERED.has(String(l.load_status));
    const dateKey = isDelivered ? day(l.delivery_date ?? l.pickup_date) : day(l.delivery_date);
    if (!dateKey) continue;
    if (expectedPayDate(dateKey, input.settlementDay) !== statementDate) continue;
    if (isDelivered) {
      loadsNet += loadNetRevenue(l);
      count++;
    } else if (!closed) {
      expectedNet += loadNetRevenue(l);
      if (l.load_status === "in_transit") inTransit++;
      else booked++;
    }
  }
  loadsNet = round2(loadsNet);
  expectedNet = round2(expectedNet);
  const baseLine = {
    week, statementDate, date, counted, loads: count, loadsNet, inTransit, booked, expectedNet,
    advances: fuel.advances, advancesSource: fuel.advancesSource, bucket, bucketKind,
  };
  const actual = settlements.find((s) => day(s.period_ending) === statementDate);
  if (actual) return { ...baseLine, amount: round2(num(actual.net)), source: "actual" };
  if (overrides[statementDate] != null) return { ...baseLine, amount: overrides[statementDate], source: "override" };
  if (count + inTransit + booked === 0 && !closed) {
    return { ...baseLine, amount: round2(weeklyRevenueFallback - fuel.advances - bucket), source: "fallback" };
  }
  return { ...baseLine, amount: round2(loadsNet + expectedNet - fuel.advances - bucket), source: "projected" };
};

// ---- the period's accrual: its own miles, paid the Friday after it closes ----

export const accrualForWeek = (input: CashBoardInput, week: PayWeek, base?: string): AccrualLine => {
  const closed = week.end < input.today;
  const future = week.start > input.today;
  const odo = weekOdometerMiles(input.readings, week, closed ? undefined : input.today);
  const byLoads = milesInWeeks(input.loads, [week]);
  const date = nextDow(addDays(week.end, 1), 5); // the Friday after the period closes
  const counted = base == null || date >= base;
  let miles: number;
  let source: AccrualLine["source"];
  let words: string;
  if (future) {
    // Nothing has rolled yet — only the loads booked into the period say anything.
    miles = byLoads.miles;
    source = byLoads.loads > 0 ? "loads" : "none";
    words = byLoads.loads > 0 ? `${fmtMiles(byLoads.miles)} mi by the loads booked so far · grows as loads land` : "nothing yet · grows as loads land";
  } else if (odo.miles == null) {
    miles = byLoads.miles;
    source = byLoads.loads > 0 ? "loads" : "none";
    words = `${fmtMiles(byLoads.miles)} mi by loads — no odometer reading before ${weekLabel(week)}`;
  } else if (closed) {
    miles = odo.miles;
    source = "odometer";
    words = `${fmtMiles(odo.miles)} mi by odometer (${readingWords(odo.start!)} → ${readingWords(odo.end!)}) × $${input.perMile} · loads said ${fmtMiles(byLoads.miles)}`;
  } else {
    miles = Math.max(odo.miles, byLoads.miles);
    source = odo.miles >= byLoads.miles ? "odometer" : "loads";
    words = `odometer ${fmtMiles(odo.miles)} mi so far${odo.end ? ` (last reading ${mdWords(odo.end.date)})` : ""} · loads picked up say ${fmtMiles(byLoads.miles)} · the larger, grows as readings land`;
  }
  const implausible = odo.miles != null && odo.miles > IMPLAUSIBLE_WEEK_MI ? odo.miles : null;
  const flag = accrualFlagOf({
    miles, weekLabel: weekLabel(week), loads: byLoads.loads, loadedMiles: byLoads.loadedMiles, deadheadMiles: byLoads.deadheadMiles,
    noDeadhead: byLoads.noDeadhead, source: odo.miles == null ? "loads" : "odometer", odometerMiles: odo.miles,
    loadsMiles: byLoads.miles, readingsWords: odo.start && odo.end ? `${readingWords(odo.start)} → ${readingWords(odo.end)}` : null,
    endSlips: odo.endSlips, backwards: odo.backwards.length, implausibleMiles: implausible,
  });
  return { amount: round2(miles * input.perMile), date, counted, miles, source, words, flag };
};

// ---- bills ----

const billsIn = (obligations: Obligation[], week: PayWeek, base?: string): BillLine[] => {
  const out: BillLine[] = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
    for (const o of obligations) {
      if (!o.active || o.day_of_month == null) continue;
      if (nextDraftDate(o.day_of_month, d) !== d) continue;
      out.push({ label: o.label, amount: num(o.draft_amount ?? o.amount), date: d, counted: base == null || d >= base });
    }
  }
  return out;
};

// ---- the board ----

export const buildCashBoard = (input: CashBoardInput): CashBoard | null => {
  const checks = [...input.checks].map((c) => ({ ...c, date: day(c.date) })).filter((c) => c.date <= input.today);
  if (checks.length === 0) return null;
  // The Ops number: the latest balance typed; on a day with both, the check
  // (typed later in the day than the Friday snapshot's raw balances).
  checks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "snapshot" ? -1 : 1));
  const base = checks[checks.length - 1];
  const B = base.date;

  const current = payWeekOf(input.today);
  const next: PayWeek = { start: addDays(current.start, 7), end: addDays(current.end, 7) };
  const prev: PayWeek = { start: addDays(current.start, -7), end: addDays(current.end, -7) };

  const build = (key: PeriodColumn["key"], week: PayWeek, opening: number | null, base?: string): PeriodColumn => {
    const deposit = depositForWeek(input, week, base);
    const fuel = fuelForWeek(input, week, base);
    const accrual = accrualForWeek(input, week, base);
    const payrollDate = nextDow(week.start, 5);
    const payroll: Line = { amount: input.weeklyPayroll, date: payrollDate, counted: base == null || payrollDate >= base };
    const bills = billsIn(input.obligations, week, base);
    const moneyDays = input.moneyDays
      .map((m) => ({ ...m, date: day(m.date) }))
      .filter((m) => m.date >= week.start && m.date <= week.end)
      .map((m) => ({ ...m, counted: base == null || m.date >= base }));
    // Last period's deposit lands on the Thursday inside the current period.
    const prevDeposit = key === "current" ? depositForWeek(input, prev, base) : null;
    const prevIn = prevDeposit && prevDeposit.date >= week.start && prevDeposit.date <= week.end ? prevDeposit : null;

    let ending: number | null = opening;
    if (ending != null) {
      if (prevIn?.counted && prevIn.amount != null) ending += prevIn.amount;
      if (deposit.counted) ending += deposit.amount;
      if (payroll.counted) ending -= payroll.amount;
      if (accrual.counted) ending -= accrual.amount;
      if (fuel.leftover.counted) ending += fuel.leftover.amount;
      for (const b of bills) if (b.counted) ending -= b.amount;
      for (const m of moneyDays) if (m.counted) ending -= m.amount;
      ending = round2(ending);
    }
    return {
      key, week, state: week.start > input.today ? "future" : "open", opening,
      prevDeposit: prevIn, deposit, payroll, accrual, fuel, bills,
      billsTotal: round2(bills.filter((b) => b.counted).reduce((s, b) => s + b.amount, 0)),
      moneyDays, ending,
    };
  };

  const col0 = build("current", current, base.balance, B);
  const col1 = build("next", next, col0.ending);
  const endings = [col0.ending, col1.ending].filter((e): e is number => e != null);
  const lowest = endings.length ? Math.min(...endings) : null;
  const clears = lowest != null && input.floatLine != null ? lowest >= input.floatLine : null;
  return { columns: [col0, col1], base, lowest, clears };
};
