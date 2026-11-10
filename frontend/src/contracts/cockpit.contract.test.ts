// THE COCKPIT, PR 1 — the landing's four bands read the same truth as the
// pages they summarise. Locked on the synthetic book at TODAY = Wed 2026-11-04.
//
// Rules: one P&L arithmetic (Money tab = Pulse card), one cash-board input
// (Cash Flow page = Pulse plate), the detention figure is the dispatch
// board's own getDetentionOwed.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { syntheticBook, TODAY, type Book } from "@/test/fixtures/book";
import { profitRows, ytdSummary, lastFiledMonth } from "@/lib/metrics/profitSummary";
import { monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { assembleCashBoardInput, type CashBoardParts } from "@/lib/metrics/cashBoardInput";
import { buildCashBoard } from "@/lib/metrics/cashBoard";
import { cashAsOf } from "@/lib/metrics/cashToday";
import { getDetentionOwed } from "@/lib/metrics/dashboard";
import { computeRateTargets, getWeekGrossCommitted, getWeekGrossEarned } from "@/lib/metrics/rateTargets";
import type { Load } from "@/types/load";
import { leaveReserve } from "@/lib/metrics/leaveReserve";
import { burnFromPeriods } from "@/lib/metrics/sitCost";
import { WEEKS_PER_MONTH } from "@/lib/metrics/sitRun";

const partsOf = (book: Book): CashBoardParts => ({
  today: TODAY,
  settlementDay: book.schedule.settlement_day,
  depositLag: book.schedule.deposit_lag_days,
  plans: [book.plan],
  accounts: book.accounts,
  snapshots: book.snapshots,
  opsChecks: book.opsChecks,
  periods: book.periods,
  loads: book.loads,
  settlements: book.settlements,
  fuelEntries: book.fuel,
  trips: book.trips,
  services: [],
  obligations: book.obligations,
  assumptions: book.assumptions,
  overrides: {},
});

describe("PROFIT · the year to date, pinned on the book", () => {
  const book = syntheticBook();
  const notes = monthlyObligationCost(book.obligations);
  const rows = profitRows(book.periods, notes);

  it("the notes are the book's monthly obligation cost", () => {
    expect(notes).toBe(1200);
  });

  it("ytdSummary pins income, profit, true net and the after-notes margin", () => {
    const y = ytdSummary(rows, 2026);
    // derived: income = 17,866.25 + 13,883.00 + 16,456.50 + 10,815.00 + 18,070.00 + 15,819.00 = 92,909.75
    expect(y.months).toBe(6);
    expect(y.income).toBeCloseTo(92909.75, 2);
    // derived: cost (cogs + expenses) = 11,228.31 + 11,761.95 + 11,801.27 + 12,241.77 + 11,602.87 + 12,443.84 = 71,080.01
    //          profit = 92,909.75 − 71,080.01 = 21,829.74
    expect(y.profit).toBeCloseTo(21829.74, 2);
    expect(y.margin).toBeCloseTo(21829.74 / 92909.75, 6); // 23.5% operating
    // derived: true net = profit − notes × months = 21,829.74 − 1,200 × 6 = 14,629.74
    expect(y.trueNet).toBeCloseTo(14629.74, 2);
    // derived: after-notes margin = 14,629.74 ÷ 92,909.75 = 15.7%
    expect(y.cashMargin).toBeCloseTo(0.157462, 5);
  });

  it("another year holds no filed month: the margins are null, never 0", () => {
    const y = ytdSummary(rows, 2025);
    expect(y.months).toBe(0);
    expect(y.income).toBe(0);
    expect(y.margin).toBeNull();
    expect(y.cashMargin).toBeNull();
  });

  it("lastFiledMonth names the book's last period (October, −/+ as filed)", () => {
    const last = lastFiledMonth(rows);
    expect(last?.month).toBe("2026-10-01");
    // derived: 15,819.00 − (4,511.59 + 7,932.25) = 3,375.16
    expect(last?.profit).toBeCloseTo(3375.16, 2);
    expect(last?.income).toBe(15819);
  });
});

describe("CASH ON HAND · one input, one builder", () => {
  const book = syntheticBook();

  it("the assembled board opens on OPS NOW and its current ending is the board's own figure", () => {
    const input = assembleCashBoardInput(partsOf(book));
    const board = buildCashBoard(input);
    expect(board?.base.balance).toBe(11240.15);
    expect(input.floatLine).toBe(10000);
    expect(board?.columns[0].missing).toEqual([]);
    // Re-pinned in v1.268.0, and the figure moved because the RULE moved.
    // A column's ending used to be that period's own lines summed; it is now
    // the BANK's balance on the column's last day, counting both columns —
    // Jason's "two timelines", the bank keeping only the calendar one. The
    // current column's last day here is Fri Nov 13 (its accrual, paid the
    // Friday after the period closes), by which point the NEXT period's $1,300
    // payroll has gone: 13,829.56 − 1,300 = 12,529.56. The rule this file
    // protects — one input, one builder, both surfaces the same number — is
    // unchanged, and `cashAsOf` moved with it so the plate and the page still
    // agree on every date, not only on today.
    expect(board?.columns[0].ending).toBeCloseTo(12529.56, 2);
  });

  it("the Cash Flow page and the Pulse plate both come through assembleCashBoardInput (the same parts → the same ending)", () => {
    const a = buildCashBoard(assembleCashBoardInput(partsOf(book)));
    const b = buildCashBoard(assembleCashBoardInput(partsOf(syntheticBook())));
    expect(a?.columns[0].ending).toBe(b?.columns[0].ending);
    // Neither surface builds its own input: each imports the one builder and
    // neither hands buildCashBoard an inline object literal.
    const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");
    const page = read("src/pages/CashFlowPage.tsx");
    const hook = read("src/hooks/useCashBoard.ts");
    expect(page).toMatch(/assembleCashBoardInput\(/);
    expect(hook).toMatch(/assembleCashBoardInput\(/);
    expect(page).not.toMatch(/buildCashBoard\(\{/);
    expect(hook).not.toMatch(/buildCashBoard\(\{/);
  });

  it("a blank planning input refuses the ending (null, with the words), never $0", () => {
    const parts = partsOf(book);
    parts.assumptions = { ...parts.assumptions, weekly_payroll: null as never };
    const board = buildCashBoard(assembleCashBoardInput(parts));
    expect(board?.columns[0].ending).toBeNull();
    expect(board?.columns[0].missing.map((m) => m.key)).toContain("weeklyPayroll");
  });
});

describe("DETENTION OWED · the dispatch board's own function", () => {
  it("counts confirmed-billable, uncollected loads and their minutes past the free hours", () => {
    const book = syntheticBook();
    const free = book.schedule.detention_free_hours; // 3
    const [a, b, c, d] = book.loads;
    // a: receiver released 13:30 against an 08:00 appointment → 5.5 h − 3 h free = 150 min
    Object.assign(a, { detention_billable: true, detention_paid: false, receiver_in: "08:00", receiver_out: "13:30", delivery_appt_start: "08:00", delivery_appt_end: null });
    // b: shipper released 13:00 against a 09:00 appointment → 4 h − 3 h = 60 min
    Object.assign(b, { detention_billable: true, detention_paid: false, shipper_in: "09:00", shipper_out: "13:00", pickup_appt_start: "09:00", pickup_appt_end: null });
    // c: the same dwell but already collected — not owed
    Object.assign(c, { detention_billable: true, detention_paid: true, receiver_in: "08:00", receiver_out: "13:30", delivery_appt_start: "08:00", delivery_appt_end: null });
    // d: the same dwell, never confirmed billable — a candidate, not an amount owed
    Object.assign(d, { detention_billable: null, detention_paid: false, receiver_in: "08:00", receiver_out: "13:30", delivery_appt_start: "08:00", delivery_appt_end: null });
    const owed = getDetentionOwed(book.loads, free);
    expect(owed.loadCount).toBe(2);
    expect(owed.totalMinutes).toBe(210); // 150 + 60
    expect(owed.items.map((i) => i.minutes)).toEqual([150, 60]); // longest first
  });

  it("the book itself owes nothing", () => {
    const book = syntheticBook();
    expect(getDetentionOwed(book.loads, book.schedule.detention_free_hours).loadCount).toBe(0);
  });
});

describe("CASH ON HAND, TODAY · the number walked to today and no further", () => {
  const book = syntheticBook();
  const board = buildCashBoard(assembleCashBoardInput(partsOf(book)));

  // The net of every counted line of EVERY column dated after `from` and on or
  // before `to`. Reconstructing a figure from one column's lines stopped being
  // honest in v1.268.0: the bank keeps one timeline, so a Friday payroll earned
  // in the next period still leaves the account on that Friday.
  const netAfter = (from: string, to: string): number => {
    let n = 0;
    for (const c of board!.columns) {
      const inRange = (l: { date: string; counted: boolean } | null | undefined) =>
        !!l && l.counted && l.date > from && l.date <= to;
      for (const l of [c.deposit, c.prevDeposit, c.fuel.leftover]) if (inRange(l)) n += l!.amount ?? 0;
      for (const l of [c.payroll, c.accrual, c.catchUp, ...c.bills, ...c.moneyDays]) if (inRange(l)) n -= l!.amount ?? 0;
    }
    return n;
  };

  it("the book's board has a current column with an opening and an ending", () => {
    expect(board).not.toBeNull();
    expect(board!.columns[0].opening).not.toBeNull();
    expect(board!.columns[0].ending).not.toBeNull();
  });

  it("once every counted line has landed (the deposit lands AFTER the period closes), today's figure IS the column's ending", () => {
    const col = board!.columns[0];
    const dated = [col.deposit, col.payroll, col.accrual, col.prevDeposit, col.catchUp, col.fuel.leftover, ...col.bills, ...col.moneyDays]
      .filter((l): l is NonNullable<typeof l> => !!l && l.counted)
      .map((l) => l.date);
    const lastDay = dated.reduce((m, d) => (d > m ? d : m), col.week.end);
    expect(lastDay > col.week.end).toBe(true); // the deposit's landing day is outside the week
    expect(cashAsOf(board!, lastDay).amount).toBeCloseTo(col.ending!, 2);
    // and at the period's own last day the deposit is still ahead, so the
    // figure is lower by exactly what has not moved yet — across BOTH columns
    // (v1.268.0), because the ending is the bank's number and the bank does
    // not know which period a Friday payroll was earned in.
    const atEnd = cashAsOf(board!, col.week.end).amount!;
    expect(atEnd + netAfter(col.week.end, col.endDate)).toBeCloseTo(col.ending!, 2);
  });

  it("before the period's first dated line, it is the opening plus the prior periods' totals", () => {
    const col = board!.columns[0];
    const dayBefore = new Date(`${col.week.start}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const key = dayBefore.toISOString().slice(0, 10);
    const prior = col.since.reduce((s, p) => s + (p.total ?? 0), 0);
    expect(cashAsOf(board!, key).amount).toBeCloseTo(col.opening! + prior, 2);
  });

  it("on TODAY it never counts a line dated after today", () => {
    const col = board!.columns[0];
    const t = cashAsOf(board!, TODAY);
    expect(t.amount).not.toBeNull();
    // Both columns again: the ending is the bank on the column's last day, so
    // walking today's figure forward to it has to cross every line in between,
    // whichever period earned it (v1.268.0).
    expect(t.amount! + netAfter(TODAY, col.endDate)).toBeCloseTo(col.ending!, 2);
  });
});

describe("THIS PAY WEEK · a TONU is never a booked load (M1-02)", () => {
  // Nov 8, 2026: the live card read $10,000 of $8,160 because the week filter
  // kept only the cancelled rule and priced TONU 4115417 ($2,500) as booked
  // freight. The rule is the house rule from lib/metrics/status: never-revenue
  // loads (cancelled, TONU) are not freight and never count in the week.
  const book = syntheticBook();
  const notes = monthlyObligationCost(book.obligations);
  const now = new Date(`${TODAY}T12:00:00Z`);
  const base = computeRateTargets(book.loads, book.periods, notes, book.schedule, now, book.trips);
  const start = base.weekStart!;
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  const inWeek = new Date(start);
  inWeek.setUTCDate(start.getUTCDate() + 1);
  const day = inWeek.toISOString().slice(0, 10);
  const tonu: Load = {
    ...book.loads[0],
    load_id: "tonu-in-week",
    load_number: "4115417",
    load_status: "tonu",
    pickup_date: day,
    delivery_date: day,
    linehaul: "2200",
    fuel_surcharge: "300",
    total_accessorials: "0",
    gross_revenue: "2500",
    net_revenue: "1730",
  } as unknown as Load;
  const withTonu = computeRateTargets([...book.loads, tonu], book.periods, notes, book.schedule, now, book.trips);

  it("the week's booked gross does not move when a TONU lands in the week", () => {
    expect(withTonu.weekBooked).toBeCloseTo(base.weekBooked!, 2);
    expect(getWeekGrossCommitted([...book.loads, tonu], start, end)).toBeCloseTo(getWeekGrossCommitted(book.loads, start, end), 2);
  });

  it("nor does the week's earned gross", () => {
    expect(withTonu.weekEarned).toBeCloseTo(base.weekEarned!, 2);
    expect(getWeekGrossEarned([...book.loads, tonu], start, end)).toBeCloseTo(getWeekGrossEarned(book.loads, start, end), 2);
  });

  it("a delivered load in the week DOES move it, by its gross", () => {
    const real: Load = { ...tonu, load_id: "real-in-week", load_number: "9990001", load_status: "delivered" } as unknown as Load;
    expect(getWeekGrossCommitted([...book.loads, real], start, end)).toBeCloseTo(getWeekGrossCommitted(book.loads, start, end) + 2500, 2);
  });
});

describe("LEAVE RESERVE · the Vault in weeks of a parked truck (Cockpit, call 5 lean A)", () => {
  const book = syntheticBook();
  const obligationsTotal = book.obligations.filter((o) => o.active && !o.on_pl).reduce((s, o) => s + Number(o.amount), 0);
  const sit = burnFromPeriods(book.periods, obligationsTotal);

  it("the sit cost is the Expenses page's own: (fixed + notes) a month, ÷ 4.345 a week", () => {
    expect(sit).not.toBeNull();
    expect(sit!.sitWeekly).toBeCloseTo(sit!.sitMonthly / WEEKS_PER_MONTH, 6);
    expect(sit!.sitMonthly).toBeGreaterThanOrEqual(obligationsTotal); // the notes are in it
  });

  it("burn = payroll + the sit week; weeks = vault ÷ burn; target = horizon × burn", () => {
    const r = leaveReserve({ vault: 6000, weeklyPayroll: 1908, sit, weeks: 4 });
    const burn = Math.round((1908 + sit!.sitWeekly) * 100) / 100;
    expect(r.weeklyBurn).toBeCloseTo(burn, 2);
    expect(r.target).toBeCloseTo(burn * 4, 1);
    expect(r.weeksCovered).toBeCloseTo(Math.round((6000 / burn) * 10) / 10, 1);
    expect(r.pct).toBeCloseTo(6000 / (burn * 4), 6);
    expect(r.missing).toEqual([]);
  });

  it("a blank is never zero: every missing input is named with where to set it", () => {
    const r = leaveReserve({ vault: null, weeklyPayroll: null, sit: null, weeks: null });
    expect(r.weeklyBurn).toBeNull();
    expect(r.weeksCovered).toBeNull();
    expect(r.target).toBeNull();
    expect(r.missing.map((m) => m.label)).toEqual([
      "the weekly payroll",
      "a filed P&L month for the cost basis",
      "the Vault balance",
      "the leave horizon",
    ]);
    const noVault = leaveReserve({ vault: null, weeklyPayroll: 1908, sit, weeks: 4 });
    expect(noVault.weeklyBurn).not.toBeNull();
    expect(noVault.weeksCovered).toBeNull();
    expect(noVault.missing.map((m) => m.key)).toEqual(["balance_vault"]);
  });

  it("an empty Vault is zero weeks, not unknown", () => {
    const r = leaveReserve({ vault: 0, weeklyPayroll: 1908, sit, weeks: 4 });
    expect(r.weeksCovered).toBe(0);
    expect(r.pct).toBe(0);
    expect(r.missing).toEqual([]);
  });
});
