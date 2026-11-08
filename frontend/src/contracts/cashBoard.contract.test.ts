// THE DEPOSIT AND THE PLAN'S MONEY — buildCashBoard on the synthetic book at
// TODAY = Wed 2026-11-04 (pay weeks run Wednesday to Tuesday).
//
// Locked rules: CASH-01 · 02 · 03 · 04 · 05 · 06 · 07 · 13 · 16, PLAN accrual
// (the Friday accrual = the pay week's chain miles × the plan's $/mile), ODO-03.
//
// CASH-16 (Nod Sheet "The Protection Stage", call 5): a planning input that
// isn't set refuses the line that needs it, every other line keeps its number,
// the ending waits.
//
// Owed elsewhere (plan.contract.test.ts): PLAN-06 (a money day with an unknown
// accrual or an unset floor refuses), and "an account with no balance typed
// reads unknown, not UNMET ($0 of $X)".
import { describe, it, expect } from "vitest";
import { syntheticBook, TODAY, type Book } from "@/test/fixtures/book";
import type { Load } from "@/types/load";
import {
  buildCashBoard,
  depositForWeek,
  accrualForWeek,
  runningWeekPace,
  runningMilesPace,
  type CashCheck,
  type CashBoardInput,
} from "@/lib/metrics/cashBoard";
import { collectReadings, weekOdometerMiles } from "@/lib/metrics/odometer";
import { deductionBuckets } from "@/lib/metrics/settlements";
import { expectedPayDate } from "@/lib/metrics/cashflow";
import { payWeekOf, type PayWeek } from "@/lib/metrics/payWeeks";

// The board's input the way CashFlowPage builds it, from the book.
const cashInput = (book: Book): CashBoardInput => {
  const opsBalance = (s: Book["snapshots"][number]): number =>
    Number(s.balances.find((b) => b.account_id === "acct-ops")?.balance);
  const checks: CashCheck[] = [
    ...book.snapshots.map((s) => ({ date: s.as_of, balance: opsBalance(s), kind: "snapshot" as const, note: s.note, createdAt: s.created_at })),
    ...book.opsChecks.map((c) => ({ date: c.as_of, balance: Number(c.balance), kind: "check" as const, note: c.note, createdAt: c.created_at })),
  ];
  const readings = collectReadings(book.fuel, book.loads, book.trips);
  return {
    today: TODAY,
    settlementDay: book.schedule.settlement_day,
    depositLagDays: book.schedule.deposit_lag_days,
    floatLine: Number(book.plan.float_line),
    checks,
    loads: book.loads,
    settlements: book.settlements,
    fuelEntries: book.fuel,
    obligations: book.obligations,
    readings,
    weeklyPayroll: Number(book.assumptions.weekly_payroll),
    perMile: Number(book.plan.maintenance_per_mile),
    fuelPaceWeekly: runningWeekPace(book.fuel, TODAY),
    fuelFallback: 900,
    milesPaceWeekly: runningMilesPace(readings, TODAY),
    advanceDefault: Number(book.assumptions.weekly_fuel_advance),
    buckets: deductionBuckets(book.settlements),
    deductionsFallback: Number(book.assumptions.weekly_settlement_deductions),
    weeklyRevenueFallback: Number(book.assumptions.weekly_revenue),
    moneyDays: [],
    overrides: {},
    accruals: book.snapshots.map((s) => ({ as_of: s.as_of, miles: s.miles, pay_week_start: s.pay_week_start })),
  };
};

const addDays = (k: string, n: number): string => {
  const d = new Date(`${k}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (k: string): number => new Date(`${k}T00:00:00Z`).getUTCDay();
const TUESDAY = 2;
const WEDNESDAY = 3;

describe("CASH-03/07/13 · the deposit per period, pinned on the book", () => {
  const book = syntheticBook();
  const input = cashInput(book);
  const board = buildCashBoard(input);

  it("the board opens on the OPS NOW check and returns the current and next periods", () => {
    expect(board).not.toBeNull();
    expect(board?.base.kind).toBe("check");
    expect(board?.base.balance).toBe(11240.15);
    expect(board?.columns.map((c) => c.key)).toEqual(["current", "next"]);
    expect(board?.columns[0].week).toEqual({ start: "2026-11-04", end: "2026-11-10" });
    expect(board?.columns[1].week).toEqual({ start: "2026-11-11", end: "2026-11-17" });
  });

  it("CASH-13 · the deduction buckets are two ex-advance averages (insurance-stack week apart)", () => {
    // derived: standard = (9 ordinary statements × (61.75 + 110.25) + the home week's 355.40) ÷ 10 = 190.34
    // derived: first-of-month = 61.75 + 110.25 + the 518.00 insurance stack = 690.00
    expect(input.buckets.standard).toBeCloseTo(190.34, 2);
    expect(input.buckets.firstOfMonth).toBeCloseTo(690, 2);
  });

  it("CURRENT period (Nov 4–10): the booked and in-transit loads are EXPECTED; deposit lands Thu Nov 12", () => {
    const d = board?.columns[0].deposit;
    expect(d?.statementDate).toBe("2026-11-11");
    expect(d?.date).toBe("2026-11-12");
    expect(d?.loads).toBe(0); // nothing delivered inside this period yet
    expect(d?.inTransit).toBe(1);
    expect(d?.booked).toBe(1);
    // derived: booked 9100033 net 2,975.00 + in-transit 9100034 net 2,809.00 = 5,784.00 expected
    expect(d?.expectedNet).toBeCloseTo(5784, 2);
    expect(d?.revenueSource).toBe("loads");
    expect(d?.advances).toBe(2000);
    expect(d?.bucket).toBeCloseTo(190.34, 2);
    // derived: 5,784.00 − 2,000.00 advance − 190.34 standard bucket − 0 carried = 3,593.66
    expect(d?.carriedIn).toBe(0);
    expect(d?.amount).toBeCloseTo(3593.66, 2);
  });

  it("NEXT period (Nov 11–17): nothing booked, so the planning fallback revenue stands in; lands Thu Nov 19", () => {
    const d = board?.columns[1].deposit;
    expect(d?.statementDate).toBe("2026-11-18");
    expect(d?.date).toBe("2026-11-19");
    expect(d?.revenueSource).toBe("fallback");
    expect(d?.revenue).toBeCloseTo(3600, 2);
    // derived: 3,600.00 weekly_revenue − 2,000.00 advance − 190.34 standard bucket − 0 carried = 1,409.66
    expect(d?.amount).toBeCloseTo(1409.66, 2);
  });

  it("CASH-01 · the PREVIOUS period (Oct 28–Nov 3) belongs to its own deposit: Nov 4's statement, landing Thu Nov 5", () => {
    const d = board?.columns[0].prevDeposit;
    expect(d?.week).toEqual({ start: "2026-10-28", end: "2026-11-03" });
    expect(d?.statementDate).toBe("2026-11-04");
    expect(d?.date).toBe("2026-11-05");
    expect(d?.loads).toBe(1); // 9100032, delivered Tue Nov 3
    // derived: 9100032 net = 4,150 × 0.73 + 500 FSC = 3,529.50
    expect(d?.loadsNet).toBeCloseTo(3529.5, 2);
    // the first-of-month statement carries the insurance stack: bucket 690.00
    expect(d?.bucketKind).toBe("first");
    // derived: 3,529.50 − 2,000.00 − 690.00 − 0 carried = 839.50
    expect(d?.amount).toBeCloseTo(839.5, 2);
  });

  it("CASH-07 · the advance is the weekly 2,000 unless the statement's actual says otherwise; no loads, no draw", () => {
    const input2 = cashInput(book);
    // a closed week with a statement in the vault reads the statement's own advances
    const closedActual = depositForWeek(input2, { start: "2026-10-21", end: "2026-10-27" });
    expect(closedActual.source).toBe("actual");
    expect(closedActual.advancesSource).toBe("actual");
    expect(closedActual.advances).toBe(2000);
    // the home week (Aug 12–18) delivered nothing and drew nothing
    const home = depositForWeek(input2, { start: "2026-08-12", end: "2026-08-18" });
    expect(home.advances).toBe(0);
    expect(home.loads).toBe(0);
  });
});

describe("CASH-04 · a negative statement lands $0 and carries into the next", () => {
  const book = syntheticBook();
  const input = cashInput(book);
  const homeWeek: PayWeek = { start: "2026-08-12", end: "2026-08-18" }; // the truck was home: statement Aug 19
  const nextWeek: PayWeek = { start: "2026-08-19", end: "2026-08-25" };

  it("the book's one negative statement (Aug 19, −355.40) lands nothing and carries the deficit out", () => {
    const negatives = book.settlements.filter((s) => Number(s.net) < 0);
    expect(negatives).toHaveLength(1);
    expect(negatives[0].period_ending).toBe("2026-08-19");
    expect(Number(negatives[0].net)).toBeCloseTo(-355.4, 2);
    const d = depositForWeek(input, homeWeek);
    expect(d.statementDate).toBe("2026-08-19");
    expect(d.source).toBe("actual");
    expect(d.amount).toBe(0); // derived: max(0, −355.40)
    expect(d.carriedOut).toBeCloseTo(-355.4, 2);
  });

  it("the next statement reads it as carriedIn", () => {
    const d = depositForWeek(input, nextWeek);
    expect(d.statementDate).toBe("2026-08-26");
    expect(d.carriedIn).toBeCloseTo(-355.4, 2);
  });

  it("a projected week whose arithmetic goes negative lands $0 and carries the shortfall (a typed deposit too)", () => {
    const withOverride: CashBoardInput = { ...input, overrides: { "2026-11-04": -400 } };
    const d = depositForWeek(withOverride, payWeekOf("2026-10-30"));
    expect(d.source).toBe("override");
    expect(d.amount).toBe(0);
    expect(d.carriedOut).toBe(-400);
  });

  it("a projection that ends below zero carries it too: no statement, an advance and bucket bigger than the week's loads", () => {
    // Week of Jul 15–21 delivered nothing but its statement is not in the vault:
    // the advance is not drawn (no loads), the bucket is, so the deficit is the bucket.
    const noStatements: CashBoardInput = { ...input, settlements: [] };
    const d = depositForWeek(noStatements, { start: "2026-07-15", end: "2026-07-21" });
    expect(d.amount).toBe(0);
    // derived: 0 revenue − 0 advance (no loads) − 190.34 bucket + 0 carried = −190.34
    expect(d.carriedOut).toBeCloseTo(-190.34, 2);
  });
});

describe("CASH-05 · a TONU never counts, nor a cancelled load", () => {
  it("the book's TONU (9100035) and cancelled load (9100036) are in no period's deposit", () => {
    const book = syntheticBook();
    const withBoth = cashInput(book);
    const without = cashInput(book);
    without.loads = book.loads.filter((l) => l.load_status !== "tonu" && l.load_status !== "cancelled");
    expect(book.loads.filter((l) => l.load_status === "tonu")).toHaveLength(1);
    // every pay week from May through the next period, projected from loads alone
    const noStatements = (i: CashBoardInput): CashBoardInput => ({ ...i, settlements: [] });
    for (let k = -30; k <= 1; k++) {
      const w = payWeekOf(addDays(TODAY, 7 * k));
      const a = depositForWeek(noStatements(withBoth), w);
      const b = depositForWeek(noStatements(without), w);
      expect(a.loads).toBe(b.loads);
      expect(a.loadsNet).toBeCloseTo(b.loadsNet, 2);
      expect(a.amount).toBeCloseTo(b.amount!, 2);
    }
  });

  it("even a TONU dated inside a closed week with its status 'tonu' adds no revenue to that week", () => {
    const book = syntheticBook();
    const tonu = book.loads.find((l) => l.load_status === "tonu") as Load;
    const week = payWeekOf(String(tonu.pickup_date).slice(0, 10)); // Jul 15–21
    const d = depositForWeek({ ...cashInput(book), settlements: [] }, week);
    expect(d.loads).toBe(0);
    expect(d.loadsNet).toBe(0);
    expect(d.revenueSource).toBe("none");
  });
});

describe("CASH-02 · Tuesday delivery pays Wednesday, a Wednesday delivery pays the next one", () => {
  // Two stand-alone delivered loads cloned from the book, delivered on either
  // side of the Tuesday/Wednesday boundary; no statements in the vault, so the
  // deposit is the projection from the loads alone.
  const tuesday = "2026-10-06";
  const wednesday = "2026-10-07";
  const clone = (id: string, delivered: string): Load => {
    const template = syntheticBook().loads[0];
    return { ...template, load_id: id, load_number: id, pickup_date: addDays(delivered, -2), delivery_date: delivered, load_status: "delivered" };
  };
  const book = syntheticBook();
  const input: CashBoardInput = { ...cashInput(book), settlements: [], loads: [clone("T-1", tuesday), clone("W-1", wednesday)] };

  it("the dates are what the test says they are", () => {
    expect(dow(tuesday)).toBe(TUESDAY);
    expect(dow(wednesday)).toBe(WEDNESDAY);
    expect(input.settlementDay).toBe(WEDNESDAY);
  });

  it("expectedPayDate: Tuesday's load pays that week's Wednesday, Wednesday's the following one", () => {
    expect(expectedPayDate(tuesday, 3)).toBe("2026-10-07");
    expect(expectedPayDate(wednesday, 3)).toBe("2026-10-14");
  });

  it("the Tuesday load sits in the pay week ending that Tuesday (statement Oct 7, lands Thu Oct 8)", () => {
    const w = payWeekOf(tuesday);
    expect(w).toEqual({ start: "2026-09-30", end: "2026-10-06" });
    const d = depositForWeek(input, w);
    expect(d.statementDate).toBe("2026-10-07");
    expect(d.date).toBe("2026-10-08");
    expect(d.loads).toBe(1);
  });

  it("the Wednesday load opens the NEXT pay week (statement Oct 14, lands Thu Oct 15)", () => {
    const w = payWeekOf(wednesday);
    expect(w).toEqual({ start: "2026-10-07", end: "2026-10-13" });
    const d = depositForWeek(input, w);
    expect(d.statementDate).toBe("2026-10-14");
    expect(d.date).toBe("2026-10-15");
    expect(d.loads).toBe(1);
  });

  it("and the book itself obeys it: every delivered load is counted in exactly the period its delivery day opens", () => {
    const noStatements: CashBoardInput = { ...cashInput(book), settlements: [] };
    const delivered = book.loads.filter((l) => l.load_status === "delivered");
    const countByWeek = new Map<string, number>();
    for (const l of delivered) {
      const w = payWeekOf(String(l.delivery_date).slice(0, 10));
      countByWeek.set(w.start, (countByWeek.get(w.start) ?? 0) + 1);
    }
    let seen = 0;
    for (const [start, n] of countByWeek) {
      const d = depositForWeek(noStatements, { start, end: addDays(start, 6) });
      expect(d.loads).toBe(n);
      seen += d.loads;
    }
    expect(seen).toBe(delivered.length);
  });
});

describe("CASH-03 · a closed period keeps every delivered load whatever payment_status says", () => {
  const flip = (book: Book): Book => {
    for (const l of book.loads) l.payment_status = l.payment_status === "paid" ? "unpaid" : "paid";
    return book;
  };
  const closedWeeks = (): PayWeek[] => {
    const out: PayWeek[] = [];
    for (let k = 1; k <= 30; k++) out.push(payWeekOf(addDays(TODAY, -7 * k)));
    return out;
  };

  it("with the statements in the vault, flipping paid↔unpaid on every load changes no closed period's deposit", () => {
    const a = cashInput(syntheticBook());
    const b = cashInput(flip(syntheticBook()));
    for (const w of closedWeeks()) {
      expect(w.end < TODAY).toBe(true);
      expect(depositForWeek(b, w).amount).toBeCloseTo(depositForWeek(a, w).amount!, 2);
    }
  });

  it("with NO statements (a pure projection from the loads), flipping it still changes nothing", () => {
    const a = { ...cashInput(syntheticBook()), settlements: [] };
    const b = { ...cashInput(flip(syntheticBook())), settlements: [] };
    let delivered = 0;
    for (const w of closedWeeks()) {
      const da = depositForWeek(a, w);
      const db = depositForWeek(b, w);
      expect(db.amount).toBeCloseTo(da.amount!, 2);
      expect(db.loads).toBe(da.loads);
      expect(db.loadsNet).toBeCloseTo(da.loadsNet, 2);
      delivered += da.loads;
    }
    expect(delivered).toBeGreaterThan(25); // the book's deliveries are really in play
  });

  it("marking every load unpaid does not shrink the open columns either", () => {
    const a = buildCashBoard(cashInput(syntheticBook()));
    const b = buildCashBoard(cashInput(flip(syntheticBook())));
    expect(b?.columns[0].deposit.amount).toBeCloseTo(a?.columns[0].deposit.amount as number, 2);
    expect(b?.columns[1].deposit.amount).toBeCloseTo(a?.columns[1].deposit.amount as number, 2);
    expect(b?.columns[0].prevDeposit?.amount).toBeCloseTo(a?.columns[0].prevDeposit?.amount as number, 2);
  });
});

describe("CASH-06 · a load still on the road is EXPECTED, only into a period that has not closed", () => {
  it("the booked (planned Oct 22) and in-transit (planned Nov 2) loads sit in no closed period, only in the open one", () => {
    const book = syntheticBook();
    const noStatements: CashBoardInput = { ...cashInput(book), settlements: [] };
    const closedOct21 = depositForWeek(noStatements, { start: "2026-10-21", end: "2026-10-27" });
    expect(closedOct21.booked).toBe(0); // its planned day was in this week; it is NOT a delivery
    expect(closedOct21.loads).toBe(1); // only 9100031, delivered Tue Oct 27
    const closedOct28 = depositForWeek(noStatements, { start: "2026-10-28", end: "2026-11-03" });
    expect(closedOct28.inTransit).toBe(0);
    expect(closedOct28.loads).toBe(1); // only 9100032
    const open = depositForWeek(noStatements, { start: "2026-11-04", end: "2026-11-10" });
    expect(open.booked).toBe(1);
    expect(open.inTransit).toBe(1);
    expect(open.loads).toBe(0);
  });
});

describe("PLAN · the Friday accrual = the pay week's chain miles × the plan's $/mile", () => {
  const book = syntheticBook();
  const input = cashInput(book);
  const perMile = Number(book.plan.maintenance_per_mile);

  it("the plan's rate is $0.32 a mile", () => {
    expect(perMile).toBe(0.32);
  });

  it("a closed week that has not accrued: odometer miles × 0.32, dated the Friday after it closes", () => {
    const week: PayWeek = { start: "2026-10-28", end: "2026-11-03" };
    const a = accrualForWeek(input, week);
    // derived: the week's chain = load 9100032's window, 520,742 → 521,552 = 810 mi; 810 × 0.32 = 259.20
    const load = book.loads.find((l) => l.load_number === "9100032") as Load;
    const chain = (load.odometer_end as number) - (load.odometer_start as number);
    expect(chain).toBe(810);
    expect(weekOdometerMiles(input.readings, week).miles).toBe(810);
    expect(a.source).toBe("odometer");
    expect(a.miles).toBe(810);
    expect(a.amount).toBeCloseTo(259.2, 2);
    expect(a.amount).toBeCloseTo((a.miles as number) * perMile, 2);
    expect(a.date).toBe("2026-11-06");
    expect(dow(a.date)).toBe(5); // a Friday
  });

  it("a week a snapshot already accrued reads the miles that moved, × 0.32, dated the snapshot's day", () => {
    const snap = book.snapshots.find((s) => s.as_of === "2026-10-23");
    expect(snap?.miles).toBe(1458);
    const week = { start: snap?.pay_week_start as string, end: addDays(snap?.pay_week_start as string, 6) };
    expect(week).toEqual({ start: "2026-10-14", end: "2026-10-20" });
    const a = accrualForWeek(input, week);
    expect(a.source).toBe("snapshot");
    expect(a.miles).toBe(1458);
    // derived: 1,458 mi × 0.32 = 466.56
    expect(a.amount).toBeCloseTo(466.56, 2);
    expect(a.date).toBe("2026-10-23");
  });

  it("the open and next columns project a normal week's miles × 0.32 on the coming Fridays", () => {
    const board = buildCashBoard(input);
    const [cur, next] = board?.columns ?? [];
    // derived: pace = the mean of the last four pay weeks that ran = 878 mi; 878 × 0.32 = 280.96
    expect(input.milesPaceWeekly).toBe(878);
    expect(cur?.accrual.source).toBe("projected");
    expect(cur?.accrual.amount).toBeCloseTo(280.96, 2);
    expect(cur?.accrual.date).toBe("2026-11-13");
    expect(next?.accrual.amount).toBeCloseTo(280.96, 2);
    expect(next?.accrual.date).toBe("2026-11-20");
    expect(cur?.accrual.amount).toBeCloseTo((cur?.accrual.miles as number) * perMile, 2);
  });
});

describe("CASH-16 · a planning input that isn't set refuses its line — never $0", () => {
  const book = syntheticBook();
  const complete = buildCashBoard(cashInput(book))!;

  it("CASH-16 · a missing weekly payroll makes the board refuse the line, never project at $0", () => {
    const board = buildCashBoard({ ...cashInput(book), weeklyPayroll: null })!;
    const [cur, next] = board.columns;
    const [curOk, nextOk] = complete.columns;
    expect(cur.payroll.amount).toBeNull();
    expect(cur.payroll.missing?.[0].label).toBe("weekly payroll");
    expect(cur.payroll.missing?.[0].fixAt).toBe("ASSUMPTIONS");
    expect(cur.ending).toBeNull();
    expect(cur.missing.map((m) => m.key)).toEqual(["weeklyPayroll"]);
    // the ending needs every line — the next period opens on it, so it waits too
    expect(next.ending).toBeNull();
    expect(board.lowest).toBeNull();
    expect(board.clears).toBeNull();
    expect(board.missing.map((m) => m.key)).toEqual(["weeklyPayroll"]);
    // every other line keeps its number
    for (const [c, ok] of [[cur, curOk], [next, nextOk]] as const) {
      expect(c.deposit).toEqual(ok.deposit);
      expect(c.accrual).toEqual(ok.accrual);
      expect(c.fuel).toEqual(ok.fuel);
      expect(c.bills).toEqual(ok.bills);
      expect(c.prevDeposit).toEqual(ok.prevDeposit);
      expect(c.catchUp).toEqual(ok.catchUp);
    }
    expect(next.payroll.amount).toBeNull();
    // a typed $0 payroll is a real answer, not a gap
    expect(buildCashBoard({ ...cashInput(book), weeklyPayroll: 0 })!.columns[0].payroll.amount).toBe(0);
  });

  it("CASH-16 · a missing weekly fuel advance makes the deposit line refuse, naming the advance", () => {
    const board = buildCashBoard({ ...cashInput(book), advanceDefault: null })!;
    const [cur] = board.columns;
    const [curOk] = complete.columns;
    // this period's deposit has no statement on file, so it needs the advance
    expect(cur.deposit.source).not.toBe("actual");
    expect(cur.deposit.amount).toBeNull();
    expect(cur.deposit.missing?.[0].label).toBe("the weekly fuel advance");
    expect(cur.ending).toBeNull();
    expect(board.lowest).toBeNull();
    expect(board.missing.some((m) => m.key === "advanceDefault")).toBe(true);
    // the lines that don't need the advance keep their exact numbers
    expect(cur.payroll).toEqual(curOk.payroll);
    expect(cur.accrual).toEqual(curOk.accrual);
    expect(cur.bills).toEqual(curOk.bills);
  });

  it("CASH-16 · a missing $ per mile makes the accrual refuse; a missing revenue fallback or deductions refuse the projection", () => {
    const noMile = buildCashBoard({ ...cashInput(book), perMile: null })!;
    expect(noMile.columns[0].accrual.amount).toBeNull();
    expect(noMile.columns[0].accrual.missing?.[0].label).toBe("the plan's $ per mile");
    expect(noMile.columns[0].accrual.missing?.[0].fixTo).toBe("/status");
    expect(noMile.columns[0].ending).toBeNull();
    expect(noMile.columns[0].payroll).toEqual(complete.columns[0].payroll);
    const noRev = buildCashBoard({ ...cashInput(book), weeklyRevenueFallback: null })!;
    expect(noRev.columns[0].deposit.amount).toBeNull();
    expect(noRev.columns[0].deposit.missing?.[0].label).toBe("the weekly revenue fallback");
    const noDed = buildCashBoard({ ...cashInput(book), deductionsFallback: null, buckets: { firstOfMonth: null, standard: null, samples: 0 } })!;
    expect(noDed.columns[0].deposit.amount).toBeNull();
    expect(noDed.columns[0].deposit.missing?.[0].label).toBe("the weekly settlement deductions");
  });
});
