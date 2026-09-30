// THE CASH BOARD, anchored (Nod Sheet rev 3, nodded 2026-09-30, all nine
// leans; #502). Pure, plan-as-input. Three PAY WEEKS (Wednesday → Tuesday):
// last (closed) · this (open) · next — rolling only on Tuesday night.
//
//   Each week carries its own NET PAY: its Wednesday statement = the loads it
//   delivered at their net − the fuel it advanced and bought (the log's actual
//   once the week closes, the 30-day pace while open, never under the fills
//   so far) − the deductions bucket. The feed's actual net wins when the
//   statement is on file; a typed override beats a projection.
//   The DEPOSIT landing in a week is LAST week's net pay, on settlement day +
//   the deposit lag (Wednesday statement, Thursday cash).
//   The board simulates day by day from the latest balance it was handed —
//   a Friday snapshot or an OPS NOW check — and every later check prints
//   its GAP against the board's figure for that day (after the bank's own
//   events, before Jason's moves), then re-bases. The gap is, by design,
//   what dash doesn't see.
//   The Plan's moves leave Ops here too: the Friday ACCRUAL (miles × $/mile
//   — a snapshot's own miles when it carries them, else the pay week's
//   odometer miles, else the loads'), and a run MONEY DAY's outflow on the
//   day of its snapshot. When a snapshot's Maintenance balance already shows
//   the accrual, the move was made before the snapshot: it isn't taken twice.
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import type { SettlementSummary } from "@/types/settlement";
import { expectedPayDate, nextDraftDate } from "./cashflow";
import { isFirstOfMonth, type DeductionBuckets } from "./settlements";
import { loadNetRevenue } from "./rateTargets";
import { payWeekOf, weeksOwed, milesInWeeks, weekLabel, type PayWeek } from "./payWeeks";
import { weekOdometerMiles, addDays, readingWords, IMPLAUSIBLE_WEEK_MI, type OdometerReading } from "./odometer";
import { accrualFlagOf } from "./planStatus";

export interface CashCheck {
  date: string; // YYYY-MM-DD
  balance: number; // the bank's Ops balance
  kind: "snapshot" | "check";
  note: string | null;
  // snapshot-only
  miles?: number | null; // the accrual it made
  maintenance?: number | null; // its Maintenance balance — "already moved" reads from this
  settlesMonth?: string | null;
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
  buckets: DeductionBuckets;
  deductionsFallback: number;
  weeklyRevenueFallback: number; // when no loads are booked into a week yet
  moneyDays: MoneyDayMove[];
  overrides: Record<string, number>; // statement date → net pay
}

export interface NetPayCell {
  statementDate: string;
  depositDate: string;
  amount: number | null;
  source: "actual" | "override" | "projected" | "fallback";
  loads: number;
  loadsNet: number;
  fuel: number;
  fuelSource: "actual" | "pace";
  bucket: number;
  bucketKind: "first" | "standard" | "fallback";
  advances: number | null; // the statement's advances, when actual
  net: number | null; // the statement's net, when actual
}

export interface FuelCell {
  amount: number;
  source: "actual" | "pace";
  fills: number;
  soFar: number;
  statementDate: string;
  depositDate: string;
}

export interface AccrualCell {
  amount: number;
  source: "snapshot" | "odometer" | "loads" | "none";
  weekLabel: string | null;
  miles: number | null;
  words: string | null; // "1,990 mi by odometer (603,232 on Sep 22 → 605,222 on Sep 29)"
  alreadyMoved: boolean;
  date: string | null;
  // The chain's health, carried so the board can print it. Odometers are
  // hand-typed at every fill: a reading that goes backwards is a typo, and so
  // is one typed too HIGH (an impossible week). The flag is accrualFlagOf's
  // own sentence, so the board and the Plan page say the same thing.
  backwards: number; // readings that go backwards inside the accrued span
  implausibleMiles: number | null; // the largest week delta too big to be real
  flag: string | null;
}

export interface CheckCell {
  date: string;
  kind: CashCheck["kind"];
  balance: number;
  projected: number | null; // what the board said for that day
  gap: number | null; // balance − projected; null for the base check
  note: string | null;
}

export interface BillCell {
  label: string;
  amount: number;
  date: string;
}

export interface BoardDay {
  date: string;
  morning: number | null;
  deposit: number | null;
  payroll: number;
  bills: BillCell[];
  accrual: number;
  moneyDay: MoneyDayMove | null;
  // Every balance typed for the day, in order — a Friday can carry both the
  // snapshot and an OPS NOW check, and the board must print both.
  checks: CheckCell[];
  // The board's own figure for the day: the morning plus the bank's own
  // events, before Jason's moves. This is what a check's gap is measured
  // against, so OPS NOW and the Checked row read the same number.
  afterBank: number | null;
  end: number | null;
}

export interface BoardWeek {
  key: "last" | "this" | "next";
  week: PayWeek;
  state: "closed" | "open" | "future";
  opening: number | null; // the board's figure for Wednesday morning
  openingCheck: CheckCell | null; // a check dated the Wednesday, if any
  netPay: NetPayCell;
  deposit: { date: string; amount: number | null; source: NetPayCell["source"] | "none"; fromWeek: PayWeek };
  payroll: number;
  accrual: AccrualCell;
  bills: BillCell[];
  billsTotal: number;
  fuel: FuelCell;
  moneyDays: MoneyDayMove[];
  checks: CheckCell[];
  ending: number | null;
  days: BoardDay[];
}

export interface CashBoard {
  weeks: [BoardWeek, BoardWeek, BoardWeek];
  base: CashCheck;
  // Every day the board actually simulated — base.date through the end of
  // next week. Wider than the three assembled weeks, which start at last
  // week's Wednesday: a check dated between the base and the window has a
  // figure here and nowhere else.
  days: BoardDay[];
  lowest: { amount: number; date: string } | null; // from today through next week
  clears: boolean | null;
}

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
const fmtMoney2 = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The first settlement day strictly after a pay week closes — its statement.
const statementDateOf = (week: PayWeek, settlementDay: number): string => {
  // A schedule outside 0–6 would spin forever — Wednesday is the house default.
  const sd = Number.isInteger(settlementDay) && settlementDay >= 0 && settlementDay <= 6 ? settlementDay : 3;
  let d = addDays(week.end, 1);
  while (dow(d) !== sd) d = addDays(d, 1);
  return d;
};

// ---- fuel by pay week ----

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

export const fuelForWeek = (
  fuel: FuelLike[],
  week: PayWeek,
  today: string,
  pace: number | null,
  fallback: number,
  settlementDay: number,
  lag: number,
): FuelCell => {
  const statementDate = statementDateOf(week, settlementDay);
  const depositDate = addDays(statementDate, lag);
  const paceWeekly = pace ?? fallback;
  if (week.end < today) {
    const { total, count } = fillsIn(fuel, week);
    return { amount: total, source: "actual", fills: count, soFar: total, statementDate, depositDate };
  }
  const { total, count } = fillsIn(fuel, week, today);
  return { amount: Math.max(paceWeekly, total), source: "pace", fills: count, soFar: total, statementDate, depositDate };
};

// ---- a week's own net pay ----

export const netPayForWeek = (input: CashBoardInput, week: PayWeek): NetPayCell => {
  const { settlements, loads, overrides, buckets, deductionsFallback, weeklyRevenueFallback, today } = input;
  const statementDate = statementDateOf(week, input.settlementDay);
  const depositDate = addDays(statementDate, input.depositLagDays);
  const fuel = fuelForWeek(input.fuelEntries, week, today, input.fuelPaceWeekly, input.fuelFallback, input.settlementDay, input.depositLagDays);
  const first = isFirstOfMonth(statementDate);
  const bucketVal = first ? (buckets.firstOfMonth ?? buckets.standard) : (buckets.standard ?? buckets.firstOfMonth);
  const bucket = bucketVal ?? deductionsFallback;
  const bucketKind: NetPayCell["bucketKind"] = bucketVal == null ? "fallback" : first ? "first" : "standard";

  let loadsNet = 0;
  let count = 0;
  // Every non-cancelled load whose statement is this week's belongs to it —
  // dash's payment flag is NOT consulted. Jason marks loads paid by hand the
  // morning the cash lands, often before the statement PDF reaches the vault;
  // skipping them collapsed a closed week's own net pay (and the deposit it
  // lands) toward zero. There is no double-count: the `actual` settlement
  // below wins the moment the statement is on file.
  for (const l of loads) {
    if (l.load_status === "cancelled") continue;
    const delivered = day(l.delivery_date ?? l.pickup_date);
    if (!delivered) continue;
    if (expectedPayDate(delivered, input.settlementDay) === statementDate) {
      loadsNet += loadNetRevenue(l);
      count++;
    }
  }
  loadsNet = round2(loadsNet);
  const base = { statementDate, depositDate, loads: count, loadsNet, fuel: fuel.amount, fuelSource: fuel.source, bucket, bucketKind };

  const actual = settlements.find((s) => day(s.period_ending) === statementDate);
  if (actual) {
    return { ...base, amount: round2(num(actual.net)), source: "actual", advances: num(actual.advances), net: round2(num(actual.net)) };
  }
  if (overrides[statementDate] != null) {
    return { ...base, amount: overrides[statementDate], source: "override", advances: null, net: null };
  }
  // No loads into a week that hasn't closed → the planning fallback. A closed
  // week with nothing delivered really did earn nothing.
  if (count === 0 && week.end >= today) {
    return { ...base, amount: round2(weeklyRevenueFallback - fuel.amount - bucket), source: "fallback", advances: null, net: null };
  }
  return { ...base, amount: round2(loadsNet - fuel.amount - bucket), source: "projected", advances: null, net: null };
};

// ---- the Friday accrual ----

const noAccrual = (onDay: string | null): AccrualCell => ({
  amount: 0, source: "none", weekLabel: null, miles: null, words: null,
  alreadyMoved: false, date: onDay, backwards: 0, implausibleMiles: null, flag: null,
});

const projectedAccrual = (
  input: CashBoardInput,
  onDay: string,
  lastAccrued: string | null,
): { cell: AccrualCell; lastAccrued: string | null } => {
  const { weeks } = weeksOwed(onDay, lastAccrued);
  if (weeks.length === 0) {
    return { cell: noAccrual(onDay), lastAccrued };
  }
  let miles = 0;
  let source: AccrualCell["source"] = "odometer";
  let backwards = 0;
  let implausible: number | null = null;
  let noDeadhead = 0;
  let loadCount = 0;
  const words: string[] = [];
  for (const w of weeks) {
    const closed = w.end < input.today;
    const odo = weekOdometerMiles(input.readings, w, closed ? undefined : input.today);
    const byWeek = milesInWeeks(input.loads, [w]);
    const byLoads = byWeek.miles;
    noDeadhead += byWeek.noDeadhead;
    loadCount += byWeek.loads;
    // A reading that goes backwards is a typo; so is one typed too HIGH,
    // which `backwardsReadings` can't see because it never goes down.
    backwards += odo.backwards.length;
    if (odo.miles != null && odo.miles > IMPLAUSIBLE_WEEK_MI && odo.miles > (implausible ?? 0))
      implausible = odo.miles;
    if (odo.miles == null) {
      miles += byLoads;
      source = "loads";
      words.push(`${fmtMiles(byLoads)} mi by loads (no reading before ${weekLabel(w)})`);
    } else if (closed) {
      miles += odo.miles;
      words.push(`${fmtMiles(odo.miles)} mi by odometer (${readingWords(odo.start!)} → ${readingWords(odo.end!)}) × $${input.perMile} · loads said ${fmtMiles(byLoads)}`);
    } else {
      const m = Math.max(odo.miles, byLoads);
      miles += m;
      words.push(`odometer ${fmtMiles(odo.miles)} mi so far${odo.end ? ` (no reading since ${mdWords(odo.end.date)})` : ""} · loads picked up say ${fmtMiles(byLoads)} · the larger, grows as readings land`);
    }
  }
  const label = weeks.length === 1 ? weekLabel(weeks[0]) : weekLabel({ start: weeks[0].start, end: weeks[weeks.length - 1].end });
  const flag = accrualFlagOf({
    miles, weekLabel: label, loads: loadCount, loadedMiles: 0, deadheadMiles: 0, noDeadhead,
    source: source === "odometer" ? "odometer" : "loads", backwards, implausibleMiles: implausible,
  });
  return {
    cell: {
      amount: round2(miles * input.perMile), source, weekLabel: label, miles,
      words: words.join(" · "), alreadyMoved: false, date: onDay,
      backwards, implausibleMiles: implausible, flag,
    },
    lastAccrued: weeks[weeks.length - 1].start,
  };
};

// ---- bills ----

const billsOn = (obligations: Obligation[], dayKey: string): BillCell[] =>
  obligations
    .filter((o) => o.active && o.day_of_month != null && nextDraftDate(o.day_of_month!, dayKey) === dayKey)
    .map((o) => ({ label: o.label, amount: num(o.draft_amount ?? o.amount), date: dayKey }));

// ---- the board ----

export const buildCashBoard = (input: CashBoardInput): CashBoard | null => {
  const checks = [...input.checks].map((c) => ({ ...c, date: day(c.date) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === "snapshot" ? -1 : 1));
  if (checks.length === 0) return null;

  const thisWeek = payWeekOf(input.today);
  const lastWeek: PayWeek = { start: addDays(thisWeek.start, -7), end: addDays(thisWeek.end, -7) };
  const nextWeek: PayWeek = { start: addDays(thisWeek.start, 7), end: addDays(thisWeek.end, 7) };
  const windowStart = lastWeek.start;
  const windowEnd = nextWeek.end;

  // The base: the latest balance at or before the window, else the first one inside it.
  const before = checks.filter((c) => c.date <= windowStart);
  const base = before.length ? before[before.length - 1] : checks.find((c) => c.date <= windowEnd) ?? null;
  if (!base) return null;

  // The net pay of every pay week whose deposit can land in the window.
  const netPayByStatement = new Map<string, NetPayCell & { week: PayWeek }>();
  let w: PayWeek = { start: addDays(lastWeek.start, -14), end: addDays(lastWeek.end, -14) };
  while (w.start <= windowEnd) {
    const cell = netPayForWeek(input, w);
    netPayByStatement.set(cell.statementDate, { ...cell, week: w });
    w = { start: addDays(w.start, 7), end: addDays(w.end, 7) };
  }
  const depositByDate = new Map<string, NetPayCell & { week: PayWeek }>();
  for (const cell of netPayByStatement.values()) depositByDate.set(cell.depositDate, cell);

  // "Already moved": a snapshot whose Maintenance rose by (about) its accrual
  // since the previous snapshot took the accrual before the balances were typed.
  const snapshots = checks.filter((c) => c.kind === "snapshot");
  // By identity, not by date: two snapshots can share a day (a money-day
  // snapshot and the Friday one), and matching on the date would measure both
  // against the same previous balance.
  const snapAt = new Map<CashCheck, number>(snapshots.map((s, i) => [s, i]));
  // The Maintenance delta when the move was made before the balances were
  // typed — null when it wasn't (or can't be read).
  const movedDelta = (c: CashCheck): number | null => {
    if (c.kind !== "snapshot" || !c.miles || c.maintenance == null) return null;
    const i = snapAt.get(c) ?? -1;
    const prev = i > 0 ? snapshots[i - 1] : null;
    if (!prev || prev.maintenance == null) return null;
    const acc = c.miles * input.perMile;
    const delta = c.maintenance - prev.maintenance;
    return acc > 0 && delta >= 0.9 * acc ? round2(delta) : null;
  };

  // Day by day from the base to the end of next week.
  const days = new Map<string, BoardDay>();
  const accrualByDay = new Map<string, AccrualCell>();
  const baseIndex = checks.indexOf(base);
  const checkByDay = new Map<string, { c: CashCheck; i: number }[]>();
  checks.forEach((c, i) => {
    const list = checkByDay.get(c.date) ?? [];
    list.push({ c, i });
    checkByDay.set(c.date, list);
  });
  const moneyDayByDate = new Map(input.moneyDays.map((m) => [day(m.date), m]));

  let balance: number | null = null;
  let lastAccrued: string | null = null;
  // Accruals recorded on snapshots before the base still advance the clock.
  for (const s of snapshots) {
    if (s.date <= base.date && s.miles) {
      const wk = payWeekOf(addDays(s.date, -1));
      const start = addDays(wk.start, -7);
      if (!lastAccrued || start > lastAccrued) lastAccrued = start;
    }
  }

  for (let d = base.date; d <= windowEnd; d = addDays(d, 1)) {
    const morning: number | null = balance;
    const dep = depositByDate.get(d);
    const deposit = dep && d > base.date ? dep.amount : null;
    const payroll = d > base.date && dow(d) === 5 ? input.weeklyPayroll : 0;
    const bills = d > base.date ? billsOn(input.obligations, d) : [];
    const billsTotal = bills.reduce((s, b) => s + b.amount, 0);
    const bank = (deposit ?? 0) - payroll - billsTotal;
    let after: number | null = morning == null ? null : morning + bank;

    let accrual: AccrualCell = noAccrual(d);
    const todays = checkByDay.get(d) ?? [];
    // The accrual reads the snapshot that carries miles (a money-day snapshot
    // beside the Friday one must not hide it); the money day, the one that
    // ticks a month.
    const snaps = todays.filter((x) => x.c.kind === "snapshot").map((x) => x.c);
    const snap = snaps.find((c) => c.miles) ?? snaps[0] ?? null;
    const settling = snaps.find((c) => c.settlesMonth) ?? null;

    if (snap && snap.miles) {
      const movedBy = movedDelta(snap);
      const moved = movedBy != null;
      const wk = payWeekOf(addDays(snap.date, -1));
      const owed = weeksOwed(snap.date, lastAccrued).weeks;
      const label = owed.length ? (owed.length === 1 ? weekLabel(owed[0]) : weekLabel({ start: owed[0].start, end: owed[owed.length - 1].end })) : weekLabel({ start: addDays(wk.start, -7), end: addDays(wk.end, -7) });
      accrual = {
        amount: round2(snap.miles * input.perMile), source: "snapshot", weekLabel: label, miles: snap.miles,
        words: `${fmtMiles(snap.miles)} mi as recorded on the ${mdWords(snap.date)} snapshot${moved ? ` · already in Maintenance (+${fmtMoney2(movedBy)}) — read from the balances, not taken twice` : ""}`,
        alreadyMoved: moved, date: d,
        // A snapshot's miles are a recorded fact, not a delta the board
        // computed — the Plan page's form is where they get flagged.
        backwards: 0, implausibleMiles: null, flag: null,
      };
      lastAccrued = owed.length ? owed[owed.length - 1].start : addDays(wk.start, -7);
    } else if (dow(d) === 5 && !snap) {
      // Every Friday inside the span, not just the ones still to come: a
      // Friday that passed with no snapshot still owes its week, and dropping
      // it made the open week's ENDING rise by the accrual mid-week while the
      // Plan page went on ordering it. `lastAccrued` is what stops a week
      // accruing twice, so a past Friday with a later snapshot still resolves
      // to the snapshot's own figure.
      const p = projectedAccrual(input, d, lastAccrued);
      accrual = p.cell;
      lastAccrued = p.lastAccrued;
    }

    // The board's own figure for the day — the morning plus the bank's own
    // events, before Jason's moves. Every check that day is measured against
    // it, and OPS NOW prints the same number.
    const afterBank: number | null = after == null ? null : round2(after - (accrual.alreadyMoved ? accrual.amount : 0));

    // Each balance typed for the day gets its own row, measured against the
    // running figure and re-basing from the last one: a Friday can carry both
    // the snapshot and an OPS NOW check, and the gap between them is the whole
    // point of the Checked row.
    const checkCells: CheckCell[] = [];
    // The first balance of the day is measured against the board's figure; a
    // second one against the first, AS TYPED — a real balance already has the
    // accrual out of it, so it must not come out twice.
    let measureAgainst: number | null = afterBank;
    for (const { c, i } of todays) {
      if (i === baseIndex) {
        checkCells.push({ date: d, kind: c.kind, balance: c.balance, projected: null, gap: null, note: c.note });
      } else {
        const projected = measureAgainst;
        checkCells.push({ date: d, kind: c.kind, balance: c.balance, projected, gap: projected == null ? null : round2(c.balance - projected), note: c.note });
      }
      after = c.balance;
      measureAgainst = c.balance;
    }

    const moneyDay = settling ? (moneyDayByDate.get(d) ?? null) : null;
    let end: number | null = after;
    if (end != null) {
      if (accrual.amount > 0 && !accrual.alreadyMoved) end -= accrual.amount;
      if (moneyDay) end -= moneyDay.amount;
      end = round2(end);
    }
    balance = end;
    accrualByDay.set(d, accrual);
    days.set(d, { date: d, morning, deposit, payroll, bills, accrual: accrual.alreadyMoved ? 0 : accrual.amount, moneyDay, checks: checkCells, afterBank, end });
  }

  const assemble = (key: BoardWeek["key"], week: PayWeek): BoardWeek => {
    const list: BoardDay[] = [];
    for (let d = week.start; d <= week.end; d = addDays(d, 1)) {
      const row = days.get(d);
      list.push(row ?? { date: d, morning: null, deposit: null, payroll: 0, bills: [], accrual: 0, moneyDay: null, checks: [], afterBank: null, end: null });
    }
    const state: BoardWeek["state"] = week.end < input.today ? "closed" : week.start > input.today ? "future" : "open";
    const netPay = netPayByStatement.get(statementDateOf(week, input.settlementDay))!;
    const depDay = list.find((x) => x.deposit != null);
    const depCell = depDay ? depositByDate.get(depDay.date)! : null;
    const accrualCells = list.map((x) => accrualByDay.get(x.date)).filter((a): a is AccrualCell => !!a && a.source !== "none");
    const accrual: AccrualCell = accrualCells.length
      ? accrualCells.reduce((a, b) => ({
          ...b,
          amount: round2(a.amount + b.amount),
          words: [a.words, b.words].filter(Boolean).join(" · "),
          miles: (a.miles ?? 0) + (b.miles ?? 0),
          // The chain's health carries across every accrual in the week; the
          // first flag is the worst one, so it holds.
          backwards: a.backwards + b.backwards,
          implausibleMiles: Math.max(a.implausibleMiles ?? 0, b.implausibleMiles ?? 0) || null,
          flag: a.flag ?? b.flag,
        }))
      : noAccrual(null);
    const bills = list.flatMap((x) => x.bills);
    const first = days.get(week.start);
    // The Wednesday's own balance, if one was typed: the LAST one that day is
    // the one the week actually opens on (it re-based).
    const openingCheck = first?.checks.at(-1) ?? null;
    const last = days.get(week.end);
    return {
      key, week, state,
      opening: first?.morning ?? (openingCheck ? openingCheck.balance : null),
      openingCheck,
      netPay,
      deposit: depCell
        ? { date: depCell.depositDate, amount: depCell.amount, source: depCell.source, fromWeek: depCell.week }
        : { date: addDays(statementDateOf({ start: addDays(week.start, -7), end: addDays(week.end, -7) }, input.settlementDay), input.depositLagDays), amount: null, source: "none", fromWeek: { start: addDays(week.start, -7), end: addDays(week.end, -7) } },
      payroll: list.reduce((s, x) => s + x.payroll, 0),
      accrual,
      bills,
      billsTotal: round2(bills.reduce((s, b) => s + b.amount, 0)),
      fuel: fuelForWeek(input.fuelEntries, week, input.today, input.fuelPaceWeekly, input.fuelFallback, input.settlementDay, input.depositLagDays),
      moneyDays: list.map((x) => x.moneyDay).filter((m): m is MoneyDayMove => !!m),
      checks: list.flatMap((x) => x.checks),
      ending: last?.end ?? null,
      days: list,
    };
  };

  const weeks: [BoardWeek, BoardWeek, BoardWeek] = [assemble("last", lastWeek), assemble("this", thisWeek), assemble("next", nextWeek)];

  let lowest: CashBoard["lowest"] = null;
  for (let d = input.today; d <= windowEnd; d = addDays(d, 1)) {
    const row = days.get(d);
    if (row?.end == null) continue;
    if (lowest == null || row.end < lowest.amount) lowest = { amount: row.end, date: d };
  }
  const clears = lowest != null && input.floatLine != null ? lowest.amount >= input.floatLine : null;
  return { weeks, base, days: [...days.values()], lowest, clears };
};
