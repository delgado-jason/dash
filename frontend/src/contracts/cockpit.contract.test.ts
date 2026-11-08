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
import { getDetentionOwed } from "@/lib/metrics/dashboard";

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
    // pinned figure: the board's own arithmetic on the book (the line-by-line derivation lives in cashBoard.contract.test.ts)
    expect(board?.columns[0].ending).toBeCloseTo(13829.56, 2);
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
