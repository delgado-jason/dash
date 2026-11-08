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
//   in the vault; no loads, no draw), minus the small fixed deductions. A load
//   still on the road is EXPECTED, never delivered.
//   Fuel is paid from the card the advance lands on, so the fills never come
//   out of Ops; what's left on the card after the fills goes to business
//   checking every MONDAY. Payroll is the fixed weekly figure, Friday. The
//   accrual is the period's own miles, Wednesday → Tuesday, by odometer, paid
//   the Friday after the period closes. Bills draft on their days. A run money
//   day leaves Ops on its day.
//   "Whenever I update my ops number, any expenses that come out on a date
//   that's on that date or after that date should get subtracted" — the
//   current column opens on the latest balance typed (OPS NOW, "the bank's
//   balance this morning", or the Friday snapshot, taken after the settlement
//   and payroll landed). What's dated before it is already inside the number
//   and is shown but not counted. The two kinds differ on their own day: a
//   morning check still has that day's payroll and drafts ahead of it; a
//   Friday snapshot already holds them. Money that lands by morning — a
//   deposit, the Monday card leftover — counts only when it lands strictly
//   after the number ("if you type after it landed, it's already in your
//   number"). Jason's own moves — the accrual, a money day — come after either
//   kind of balance, so they count on the day. Everything the previous
//   period(s) still owe after the number — their bills, payroll, accrual,
//   card leftover, a money day — rides into the current column as "since
//   your number". The bottom carries to the next column as its opening.
//   No gap line. Dates are the #1 bug: every date is a sliced calendar day.
//
// Revised 2026-11-04 (the site-wide audit, Jason's answers):
//   · Your own moves (the accrual, a money day) follow the OUTFLOW rule — a
//     snapshot already holds a move made on its own day ("I move the Friday
//     accrual before I type the snapshot"); a morning check still has it ahead.
//   · A previous period's lines are counted by their OWN dates — its accrual
//     lands the Friday after it closes, its deposit the Thursday — so the
//     walk back stops only when a period's last line is before the number.
//   · A TONU is never booked as revenue until the statement pays it ("I am
//     subject to whatever the shipper agrees to pay").
//   · A statement whose net is negative lands nothing: Landstar carries the
//     deficit into the next statement, which pays that much less.
//   · The fuel pace and the mile pace are the average of the last four pay
//     weeks that actually ran (idle weeks skipped), so a home stint doesn't
//     dilute them; an open period's accrual is projected like its deposit.
//   · A single booking never replaces the planning fallback: an open period
//     projects the larger of its loads and the fallback.
//   · The verdict reads the lowest day of the two periods, not two endings.
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import type { SettlementSummary } from "@/types/settlement";
import { expectedPayDate, nextDraftDate } from "./cashflow";
import { isFirstOfMonth, type DeductionBuckets } from "./settlements";
import { loadNetRevenue } from "./rateTargets";
import { payWeekOf, milesInWeeks, weekLabel, type PayWeek } from "./payWeeks";
import { weekOdometerMiles, addDays, readingWords, IMPLAUSIBLE_WEEK_MI, type OdometerReading } from "./odometer";
import { accrualFlagOf } from "./planStatus";
import { accrualsByWeek, retrueAccrued, retrueWords, type AccrualRecord } from "./accrualTruth";
import { isDelivered, isNeverRevenue } from "./status";

export interface CashCheck {
  date: string; // YYYY-MM-DD
  balance: number; // the bank's Ops balance
  kind: "snapshot" | "check";
  note: string | null;
  createdAt?: string | null; // when it was typed — breaks a same-day tie (the later one is the number)
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
  fuelPaceWeekly: number | null; // $/week over the last four running pay weeks (runningWeekPace); null → fuelFallback
  fuelFallback: number;
  milesPaceWeekly?: number | null; // odometer miles/week over the last four running pay weeks (runningMilesPace)
  advanceDefault: number; // the weekly fuel advance borrowed against the loads — $2,000
  buckets: DeductionBuckets;
  deductionsFallback: number;
  weeklyRevenueFallback: number; // when nothing is booked into a period yet
  moneyDays: MoneyDayMove[];
  overrides: Record<string, number>; // statement date → deposit
  // The accruals the snapshots recorded (miles + the week they covered), so a
  // week that already accrued reads the miles that MOVED and the chain's
  // afterthoughts ride in one catch-up line (call 8, 2026-11-04).
  accruals?: AccrualRecord[];
}

// A dated line. `counted` = it goes into the column's Ops arithmetic.
export interface Line {
  amount: number;
  date: string;
  counted: boolean;
}

export interface FuelLine {
  spent: number; // the period's fills — actual once closed (or once they pass the pace), else the pace
  spentSource: "actual" | "pace";
  fills: number;
  soFar: number;
  advances: number; // drawn in the period — the statement's actual, else assumed
  // actual = the statement · assumed = the weekly advance · fills = the logged
  // fills passed it · none = no loads, no draw
  advancesSource: "actual" | "assumed" | "fills" | "none";
  leftover: Line; // advances − spent → Ops, the Monday inside the period
}

export interface DepositLine extends Line {
  week: PayWeek; // the period that earned it
  statementDate: string;
  source: "actual" | "override" | "projected" | "fallback";
  // An open period projects the larger of its loads and the planning fallback —
  // one small booking must not replace a whole week's expected revenue.
  revenueSource: "loads" | "fallback" | "none";
  revenue: number; // delivered + expected (or the fallback) before the advance and the bucket
  // Landstar carries a negative statement into the next one. carriedIn is what
  // earlier statements left owing (≤ 0, already applied to amount); carriedOut
  // is what this statement itself carries forward (≤ 0) — nothing lands.
  carriedIn: number;
  carriedOut: number;
  loads: number; // delivered — status says so
  loadsNet: number;
  inTransit: number;
  booked: number;
  expectedNet: number;
  advances: number;
  advancesSource: FuelLine["advancesSource"];
  bucket: number;
  bucketKind: "first" | "standard" | "fallback";
  fuel: FuelLine; // the period's fuel, computed once
}

export interface AccrualLine extends Line {
  miles: number | null;
  // snapshot = a week that already accrued: the miles a snapshot recorded,
  // dated the day they moved.
  source: "odometer" | "loads" | "projected" | "none" | "snapshot";
  words: string | null;
  flag: string | null;
}

export interface BillLine {
  label: string;
  amount: number;
  date: string;
  counted: boolean;
}

export type MoneyDayLine = MoneyDayMove & { counted: boolean };

// What a period still owes (or sends) after the Ops number, when the number
// is older than the current period's Wednesday.
export interface PriorLines {
  week: PayWeek;
  payroll: Line | null;
  accrual: AccrualLine | null;
  leftover: Line | null;
  deposit: DepositLine | null; // an older period's deposit that landed after the number
  bills: BillLine[];
  moneyDays: MoneyDayLine[];
  total: number; // signed: inflows − outflows, counted lines only
}

export interface PeriodColumn {
  key: "current" | "next";
  week: PayWeek;
  state: "open" | "future";
  opening: number | null;
  since: PriorLines[]; // current column only — the previous period(s) since the number
  prevDeposit: DepositLine | null; // last period's money landing inside this period — current column only
  deposit: DepositLine; // this period's own, landing after it closes
  payroll: Line;
  accrual: AccrualLine;
  // Closed weeks re-trued: the miles the chain found after the fact across
  // every week that already accrued, × $/mile, on the next Friday — in the
  // column that Friday falls in. Negative when weeks were over-accrued.
  catchUp?: AccrualLine | null;
  fuel: FuelLine;
  bills: BillLine[];
  billsTotal: number; // counted only
  moneyDays: MoneyDayLine[];
  ending: number | null;
}

export interface LowestDay {
  amount: number;
  date: string; // the day the running balance bottoms out
}

export interface CashBoard {
  columns: [PeriodColumn, PeriodColumn];
  base: CashCheck; // the Ops number the current column opens on
  lowest: LowestDay | null; // the lowest day across both periods, by every counted line's own date
  clears: boolean | null; // lowest.amount ≥ the float line
}

// "Delivered" and "never revenue" (a cancelled load, a TONU) come from
// ./status — one definition for every page. This file's old DELIVERED set also
// listed "invoiced" and "paid"; those are payment_status values, never a
// load_status, so they were unreachable entries and dropping them changes
// nothing.

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

// A schedule outside 0–6 (or NaN from a bad column) would spin the statement
// walk forever and throw inside expectedPayDate — Wednesday is the house default.
export const normalizeSettlementDay = (d: number | null | undefined): number =>
  Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6 ? (d as number) : 3;

// The first settlement day strictly after a pay period closes — its statement.
export const statementDateOf = (week: PayWeek, settlementDay: number): string => {
  const sd = normalizeSettlementDay(settlementDay);
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

// ---- the counting rules against the Ops number ----

// A bank event the number may already hold: dated before it → inside; dated
// after → counts; dated the same day → a morning check still has it ahead,
// a Friday snapshot (taken after the settlement and payroll landed) already
// holds it.
const countsOut = (date: string, base?: CashCheck): boolean =>
  base == null || date > day(base.date) || (date === day(base.date) && base.kind === "check");
// Money that is there by morning — a deposit, the Monday card leftover.
const countsIn = (date: string, base?: CashCheck): boolean => base == null || date > day(base.date);
// Jason's own moves — the accrual, a money day — follow the outflow rule: he
// moves the money BEFORE he types the snapshot, so a snapshot dated the move's
// day already holds it; a morning check still has it ahead (2026-11-04).
const countsMove = countsOut;

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

// The pace of a thing per pay week, from the last `weeks` CLOSED pay weeks
// that actually ran (value > 0), walking back at most `lookback` weeks so a
// home stint — or a month at home — never dilutes it with zero weeks. null when
// no week ran.
const runningPace = (
  today: string,
  valueOf: (week: PayWeek) => number,
  weeks = 4,
  lookback = 12,
): number | null => {
  let w = payWeekOf(today);
  const vals: number[] = [];
  for (let i = 0; i < lookback && vals.length < weeks; i++) {
    w = { start: addDays(w.start, -7), end: addDays(w.end, -7) };
    const v = valueOf(w);
    if (v > 0) vals.push(v);
  }
  if (vals.length === 0) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
};

// Fuel $/week over the last four pay weeks with a fill.
export const runningWeekPace = (fuel: FuelLike[], today: string, weeks = 4): number | null =>
  runningPace(today, (w) => fillsIn(fuel, w).total, weeks);

// Odometer miles/week over the last four pay weeks that rolled.
export const runningMilesPace = (readings: OdometerReading[], today: string, weeks = 4): number | null =>
  runningPace(today, (w) => weekOdometerMiles(readings, w).miles ?? 0, weeks);

// The period's fuel: the log's fills once the period closes; while it's open,
// the fills so far or the 30-day pace, whichever is larger; a future period
// at the pace. The advance drawn against the period's loads: the statement's
// actual once it's in the vault, else the weekly advance unless the logged
// fills pass it — and nothing at all when the period has no loads to borrow
// against (a closed period that earned nothing). What's left on the card
// after the fills goes to Ops on the Monday inside the period.
export const fuelForWeek = (
  input: Pick<CashBoardInput, "fuelEntries" | "today" | "fuelPaceWeekly" | "fuelFallback" | "advanceDefault" | "settlements" | "settlementDay">,
  week: PayWeek,
  base?: CashCheck,
  noLoads = false,
): FuelLine => {
  const paceWeekly = input.fuelPaceWeekly ?? input.fuelFallback;
  const closed = week.end < input.today;
  const { total, count } = closed ? fillsIn(input.fuelEntries, week) : fillsIn(input.fuelEntries, week, input.today);
  const spent = closed ? total : Math.max(paceWeekly, total);
  const spentSource: FuelLine["spentSource"] = closed || total >= paceWeekly ? "actual" : "pace";
  const statementDate = statementDateOf(week, input.settlementDay);
  const actual = input.settlements.find((s) => day(s.period_ending) === statementDate);
  const advancesActual = actual ? num(actual.advances) : null;
  const advances = advancesActual ?? (noLoads ? 0 : Math.max(input.advanceDefault, total));
  const advancesSource: FuelLine["advancesSource"] =
    advancesActual != null ? "actual" : noLoads ? "none" : total > input.advanceDefault ? "fills" : "assumed";
  const monday = nextDow(week.start, 1);
  return {
    spent, spentSource, fills: count, soFar: total,
    advances, advancesSource,
    leftover: { amount: round2(Math.max(0, advances - spent)), date: monday, counted: countsIn(monday, base) },
  };
};

// ---- a period's own deposit ----

// What earlier statements left owing. Landstar carries a negative statement
// into the next one — a deficit never leaves Ops on a Thursday, the next
// deposit is just that much smaller. Walk back one statement at a time while
// the previous statement is on file and negative; stop at the first positive
// one (which absorbed anything older) or at a gap in the feed.
const carriedInto = (settlements: SettlementSummary[], statementDate: string): number => {
  let carried = 0;
  let d = addDays(statementDate, -7);
  for (let i = 0; i < 12; i++) {
    const s = settlements.find((x) => day(x.period_ending) === d);
    if (!s) break;
    const net = num(s.net);
    if (net >= 0) break;
    carried += net;
    d = addDays(d, -7);
  }
  return round2(carried);
};

export const depositForWeek = (input: CashBoardInput, week: PayWeek, base?: CashCheck): DepositLine => {
  const { settlements, loads, overrides, buckets, deductionsFallback, weeklyRevenueFallback, today } = input;
  const sd = normalizeSettlementDay(input.settlementDay);
  const statementDate = statementDateOf(week, sd);
  const date = addDays(statementDate, input.depositLagDays);
  const counted = countsIn(date, base);
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
  // The first statement that is still open: a load still on the road past its
  // planned delivery rolls into it instead of vanishing into a closed period.
  const firstOpenStatement = statementDateOf(payWeekOf(today), sd);
  // Delivered means the status says so. A load still on the road with a
  // planned delivery date is expected, and only into a period that hasn't
  // closed. dash's payment flag is NOT consulted — Jason marks loads paid by
  // hand the morning the cash lands, often before the statement reaches the
  // vault; the statement's actual below wins the moment it's on file. A TONU
  // is never projected: whatever the shipper agrees to pay arrives on the
  // statement.
  for (const l of loads) {
    if (isNeverRevenue(l)) continue;
    const delivered = isDelivered(l);
    const dateKey = delivered ? day(l.delivery_date ?? l.pickup_date) : day(l.delivery_date);
    if (!dateKey) continue;
    let planned = expectedPayDate(dateKey, sd);
    if (!delivered && planned < firstOpenStatement) planned = firstOpenStatement;
    if (planned !== statementDate) continue;
    if (delivered) {
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
  const noLoads = count + inTransit + booked === 0;
  const fuel = fuelForWeek({ ...input, settlementDay: sd }, week, base, closed && noLoads);
  const carriedIn = carriedInto(settlements, statementDate);
  const baseLine = {
    week, statementDate, date, counted, loads: count, loadsNet, inTransit, booked, expectedNet,
    advances: fuel.advances, advancesSource: fuel.advancesSource, bucket, bucketKind, fuel, carriedIn,
  };
  // The statement itself: its net lands if positive; a negative net lands
  // nothing and is carried into the next statement.
  const actual = settlements.find((s) => day(s.period_ending) === statementDate);
  if (actual) {
    const net = round2(num(actual.net));
    return { ...baseLine, amount: Math.max(0, net), source: "actual", revenueSource: "loads", revenue: round2(num(actual.revenue)), carriedOut: Math.min(0, net) };
  }
  if (overrides[statementDate] != null) {
    const v = overrides[statementDate];
    return { ...baseLine, amount: Math.max(0, v), source: "override", revenueSource: "loads", revenue: v, carriedOut: Math.min(0, v) };
  }
  // The period's revenue: what it delivered and still expects, or — while it
  // is open or future and the loads say less than a normal week — the
  // planning fallback. A closed period stands on its loads alone.
  const fromLoads = round2(loadsNet + expectedNet);
  let revenue: number;
  let revenueSource: DepositLine["revenueSource"];
  if (closed) {
    revenue = fromLoads;
    revenueSource = noLoads ? "none" : "loads";
  } else if (fromLoads >= weeklyRevenueFallback) {
    revenue = fromLoads;
    revenueSource = "loads";
  } else {
    revenue = round2(weeklyRevenueFallback);
    revenueSource = "fallback";
  }
  // A closed period that ran nothing drew nothing — but Landstar's recurring
  // deductions still post, so the statement carries a deficit forward.
  const gross = round2(revenue - fuel.advances - bucket + carriedIn);
  const source: DepositLine["source"] = revenueSource === "fallback" ? "fallback" : "projected";
  return { ...baseLine, amount: Math.max(0, gross), source, revenueSource, revenue, carriedOut: Math.min(0, gross) };
};

// ---- the period's accrual: its own miles, paid the Friday after it closes ----

export const accrualForWeek = (input: CashBoardInput, week: PayWeek, base?: CashCheck): AccrualLine => {
  const closed = week.end < input.today;
  const future = week.start > input.today;
  const odo = weekOdometerMiles(input.readings, week, closed ? undefined : input.today);
  const byLoads = milesInWeeks(input.loads, [week]);
  // A week a snapshot already accrued reads the miles that MOVED, dated the
  // day they moved — the stored miles win (call 8); whatever the chain says
  // beyond them rides in the board's catch-up line.
  const rec = closed && input.accruals ? accrualsByWeek(input.accruals).get(week.start) : undefined;
  const date = rec ? rec.movedOn : nextDow(addDays(week.end, 1), 5); // else the Friday after the period closes
  const counted = countsMove(date, base);
  let miles: number;
  let source: AccrualLine["source"];
  let words: string;
  const pace = input.milesPaceWeekly ?? null;
  if (rec) {
    miles = rec.stored;
    source = "snapshot";
    const chainNow = odo.miles == null ? `${fmtMiles(byLoads.miles)} by loads` : fmtMiles(odo.miles);
    words = rec.own
      ? `${fmtMiles(rec.stored)} mi moved with the ${mdWords(rec.movedOn)} snapshot × $${input.perMile} · the chain now says ${chainNow} — any difference rides in the catch-up`
      : `accrued with the ${mdWords(rec.movedOn)} snapshot — its miles are booked on that snapshot's own week`;
  } else if (future) {
    // Nothing has rolled yet: a normal week's miles (the last four that ran),
    // or the loads booked into it if they say more.
    if (pace != null && pace > byLoads.miles) {
      miles = pace;
      source = "projected";
      words = `projected ${fmtMiles(pace)} mi — a normal week (last four that ran)${byLoads.loads > 0 ? ` · loads booked so far say ${fmtMiles(byLoads.miles)}` : ""} · actual miles replace it as readings land`;
    } else {
      miles = byLoads.miles;
      source = byLoads.loads > 0 ? "loads" : "none";
      words = byLoads.loads > 0 ? `${fmtMiles(byLoads.miles)} mi by the loads booked so far · grows as loads land` : "nothing yet · grows as loads land";
    }
  } else if (!closed && pace != null && pace > Math.max(odo.miles ?? 0, byLoads.miles)) {
    // Open and still short of a normal week: project the week, the way the
    // deposit does — the odometer takes over the moment it says more.
    miles = pace;
    source = "projected";
    words = `projected ${fmtMiles(pace)} mi — a normal week (last four that ran) · odometer ${fmtMiles(odo.miles ?? 0)} mi so far${odo.end ? ` (last reading ${mdWords(odo.end.date)})` : ""} · actual miles replace it as readings land`;
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

const billsIn = (obligations: Obligation[], week: PayWeek, base?: CashCheck): BillLine[] => {
  const out: BillLine[] = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
    for (const o of obligations) {
      if (!o.active || o.day_of_month == null) continue;
      if (nextDraftDate(o.day_of_month, d) !== d) continue;
      out.push({ label: o.label, amount: num(o.draft_amount ?? o.amount), date: d, counted: countsOut(d, base) });
    }
  }
  return out;
};

const moneyDaysIn = (moves: MoneyDayMove[], week: PayWeek, base?: CashCheck): MoneyDayLine[] =>
  moves
    .map((m) => ({ ...m, date: day(m.date) }))
    .filter((m) => m.date >= week.start && m.date <= week.end)
    .map((m) => ({ ...m, counted: countsMove(m.date, base) }));

// ---- the board ----

export const buildCashBoard = (raw: CashBoardInput): CashBoard | null => {
  const input: CashBoardInput = { ...raw, settlementDay: normalizeSettlementDay(raw.settlementDay) };
  const checks = [...input.checks].map((c) => ({ ...c, date: day(c.date) })).filter((c) => c.date <= input.today);
  if (checks.length === 0) return null;
  // The Ops number: the latest balance typed; on a day with both, the one
  // typed later (createdAt), else the check.
  checks.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.kind === b.kind ? 0 : a.kind === "snapshot" ? -1 : 1;
  });
  const base = checks[checks.length - 1];

  const current = payWeekOf(input.today);
  const shift = (w: PayWeek, n: number): PayWeek => ({ start: addDays(w.start, n), end: addDays(w.end, n) });
  const next = shift(current, 7);
  const prev = shift(current, -7);

  // Closed weeks re-true (call 8): what the chain says today about every week
  // that already accrued, net of the miles that moved — one catch-up line on
  // the next Friday, so the Plan's order and this ledger are the same figure.
  const retrue = input.accruals ? retrueAccrued(input.accruals, input.readings, input.loads, input.today) : null;
  const catchUpDate = nextDow(input.today, 5);
  const catchUp: AccrualLine | null =
    retrue && retrue.deltaMiles !== 0
      ? {
          amount: round2(retrue.deltaMiles * input.perMile),
          date: catchUpDate,
          counted: true,
          miles: retrue.deltaMiles,
          source: "odometer",
          words: `${retrueWords(retrue)} × $${input.perMile} · rides with the ${mdWords(catchUpDate)} accrual`,
          flag: null,
        }
      : null;

  // Everything the previous period(s) still owe after the Ops number — a
  // number older than this Wednesday leaves their later-dated lines in no
  // column otherwise. A period owns lines dated AFTER its last day: its
  // deposit lands the Thursday after it closes and its accrual the Friday
  // (end + 3). Walk back while a period's last line is on or after the number.
  const since: PriorLines[] = [];
  for (let k = 1; ; k++) {
    const w = shift(current, -7 * k);
    if (addDays(w.end, 3) < base.date) break;
    if (k > 8) break; // a number two months old is a number to retype, not a ledger to rebuild
    const payrollDate = nextDow(w.start, 5);
    const payroll: Line = { amount: input.weeklyPayroll, date: payrollDate, counted: countsOut(payrollDate, base) };
    const accrual = accrualForWeek(input, w, base);
    const dep = depositForWeek(input, w, base);
    // The previous period's own deposit lands inside the current period and
    // rides there as prevDeposit; an older period's deposit landed earlier.
    const deposit = k >= 2 && dep.counted ? dep : null;
    const leftover = dep.fuel.leftover;
    const bills = billsIn(input.obligations, w, base);
    const moneyDays = moneyDaysIn(input.moneyDays, w, base);
    const total = round2(
      (deposit ? deposit.amount : 0) + (leftover.counted ? leftover.amount : 0)
      - (payroll.counted ? payroll.amount : 0) - (accrual.counted ? accrual.amount : 0)
      - bills.filter((b) => b.counted).reduce((s, b) => s + b.amount, 0)
      - moneyDays.filter((m) => m.counted).reduce((s, m) => s + m.amount, 0),
    );
    const any = payroll.counted || accrual.counted || leftover.counted || deposit != null || bills.some((b) => b.counted) || moneyDays.some((m) => m.counted);
    if (any) {
      since.push({
        week: w,
        payroll: payroll.counted ? payroll : null,
        accrual: accrual.counted ? accrual : null,
        leftover: leftover.counted ? leftover : null,
        deposit,
        bills: bills.filter((b) => b.counted),
        moneyDays: moneyDays.filter((m) => m.counted),
        total,
      });
    }
  }

  const build = (key: PeriodColumn["key"], week: PayWeek, opening: number | null, base?: CashCheck): PeriodColumn => {
    const deposit = depositForWeek(input, week, base);
    const fuel = deposit.fuel;
    const accrual = accrualForWeek(input, week, base);
    const payrollDate = nextDow(week.start, 5);
    const payroll: Line = { amount: input.weeklyPayroll, date: payrollDate, counted: countsOut(payrollDate, base) };
    const bills = billsIn(input.obligations, week, base);
    const moneyDays = moneyDaysIn(input.moneyDays, week, base);
    // The catch-up lands in the column its Friday falls in.
    const cu = catchUp && catchUp.date >= week.start && catchUp.date <= week.end ? { ...catchUp, counted: countsMove(catchUp.date, base) } : null;
    // Last period's deposit lands on the Thursday inside the current period.
    const prevDeposit = key === "current" ? depositForWeek(input, prev, base) : null;
    const prevIn = prevDeposit && prevDeposit.date >= week.start && prevDeposit.date <= week.end ? prevDeposit : null;
    const sinceTotal = key === "current" ? since.reduce((s, p) => s + p.total, 0) : 0;

    let ending: number | null = opening;
    if (ending != null) {
      ending += sinceTotal;
      if (prevIn?.counted) ending += prevIn.amount;
      if (deposit.counted) ending += deposit.amount;
      if (payroll.counted) ending -= payroll.amount;
      if (accrual.counted) ending -= accrual.amount;
      if (cu?.counted) ending -= cu.amount;
      if (fuel.leftover.counted) ending += fuel.leftover.amount;
      for (const b of bills) if (b.counted) ending -= b.amount;
      for (const m of moneyDays) if (m.counted) ending -= m.amount;
      ending = round2(ending);
    }
    return {
      key, week, state: week.start > input.today ? "future" : "open", opening,
      since: key === "current" ? since : [],
      prevDeposit: prevIn, deposit, payroll, accrual, catchUp: cu, fuel, bills,
      billsTotal: round2(bills.filter((b) => b.counted).reduce((s, b) => s + b.amount, 0)),
      moneyDays, ending,
    };
  };

  const col0 = build("current", current, base.balance, base);
  const col1 = build("next", next, col0.ending);
  const lowest = lowestDay(base, [col0, col1], input.today);
  const clears = lowest != null && input.floatLine != null ? lowest.amount >= input.floatLine : null;
  return { columns: [col0, col1], base, lowest, clears };
};

// Every counted line of both columns on its own day, in order, run from the
// Ops number: the lowest balance from today on is the verdict's number — two
// endings can clear the float while a Sunday between them sits under it.
export const lowestDay = (base: CashCheck, columns: PeriodColumn[], today: string): LowestDay | null => {
  const moves: { date: string; amount: number }[] = [];
  const push = (l: Line | null | undefined, sign: 1 | -1) => {
    if (l && l.counted && l.amount !== 0) moves.push({ date: l.date, amount: sign * l.amount });
  };
  for (const c of columns) {
    for (const p of c.since) {
      push(p.deposit, 1);
      push(p.leftover, 1);
      push(p.payroll, -1);
      push(p.accrual, -1);
      for (const b of p.bills) push(b, -1);
      for (const m of p.moneyDays) push({ amount: m.amount, date: m.date, counted: m.counted }, -1);
    }
    push(c.prevDeposit, 1);
    push(c.deposit, 1);
    push(c.payroll, -1);
    push(c.accrual, -1);
    push(c.catchUp ?? null, -1);
    push(c.fuel.leftover, 1);
    for (const b of c.bills) push(b, -1);
    for (const m of c.moneyDays) push({ amount: m.amount, date: m.date, counted: m.counted }, -1);
  }
  moves.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let bal = base.balance;
  let low: LowestDay | null = null;
  let sawToday = false;
  const consider = (date: string) => {
    if (date < today) return;
    if (date === today) sawToday = true;
    if (low == null || bal < low.amount) low = { amount: round2(bal), date };
  };
  // Apply each day's moves together, then read the balance at the END of the
  // day — a deposit that lands by morning is in before anything is decided.
  for (let i = 0; i < moves.length; ) {
    const d = moves[i].date;
    if (d > today && !sawToday) consider(today); // a quiet today still has a balance
    while (i < moves.length && moves[i].date === d) {
      bal += moves[i].amount;
      i++;
    }
    consider(d);
  }
  if (!sawToday) consider(today);
  return low;
};
