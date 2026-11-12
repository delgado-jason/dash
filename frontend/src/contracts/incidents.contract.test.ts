// THE FIVE INCIDENTS, END TO END ON THE SYNTHETIC BOOK. Each describe is one
// real failure that reached the money; its title carries the rule id and the
// incident date. A red test is a business rule moving: the PR body must say
// "Rule change: <id> — <why>".
//
// Locked rules: BASIS-02, PNL-01/02/04, MKT-08, CASH-03/06, PACE-02, DAY-02,
// MKT-01, DIAL-02.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { syntheticBook, brokenPeriod, TODAY, type Book } from "@/test/fixtures/book";
import type { Load } from "@/types/load";
import { parsePnlRows } from "@/lib/pnl/parsePnl";
import {
  computeRateTargets,
  monthlyObligationCost,
  monthMiles,
  getWeekGrossEarned,
  getWeekGrossCommitted,
  getWeekGrossPipeline,
  loadGross,
} from "@/lib/metrics/rateTargets";
import { buildLedger, sequenceLoads } from "@/lib/metrics/marketLedger";
import { gradeCostsOf, reloadYardstick } from "@/lib/metrics/marketFactor";
import {
  buildCashBoard,
  depositForWeek,
  runningWeekPace,
  runningMilesPace,
  type CashCheck,
  type CashBoardInput,
} from "@/lib/metrics/cashBoard";
import { collectReadings } from "@/lib/metrics/odometer";
import { deductionBuckets } from "@/lib/metrics/settlements";
import { completedPayWeekTotals, payWeekOf } from "@/lib/metrics/payWeeks";
import { getRevenueMTD, getRevenueLastMonth, getRevenueYTD, getMonthlyRevenue } from "@/lib/metrics/dashboard";
import { perDayOver } from "@/lib/metrics/perDay";
import { marketSignal, type SeriesPoint } from "@/lib/metrics/marketSignal";
import { dialAdvice } from "@/lib/metrics/rateDial";
import { buildMarketCall } from "@/lib/metrics/marketCall";
import { ratePoints } from "@/lib/metrics/marketAnalytics";

const now = new Date(`${TODAY}T00:00:00Z`);

const targetsOf = (book: Book, periods = book.periods) =>
  computeRateTargets(book.loads, periods, monthlyObligationCost(book.obligations), book.schedule, now);

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

const isOnTheRoad = (l: Load): boolean => l.load_status === "booked" || l.load_status === "in_transit";

describe("BASIS-02 · PNL-01/02/04 · 2026-11-01 · October saved NULL totals and every rung dropped", () => {
  // QuickBooks' newer layout: "Total Expenses", "Gross Profit", "Net Operating
  // Income" with no "for".
  const sheet = (opts: { cogsTotal?: boolean; expenseTotalValue?: string } = {}): string[][] => [
    ["Delgado Test Carrier"],
    ["Profit and Loss"],
    [""],
    ["", "Oct 2026"],
    ["Income"],
    ["Linehaul Sales", "$15,000.00"],
    ["Total Income", "$15,000.00"],
    ["Cost of Goods Sold"],
    ["Fuel", "$5,000.00"],
    ["Maintenance & Repairs", "$1,000.00"],
    ...(opts.cogsTotal === false ? [] : [["Total Cost of Goods Sold", "$6,000.00"]]),
    ["Gross Profit", "$9,000.00"],
    ["Expenses"],
    ["Payroll", "$5,000.00"],
    ["Insurance", "$1,350.00"],
    ["Total Expenses", opts.expenseTotalValue ?? "$6,350.00"],
    ["Net Operating Income", "$2,650.00"],
    ["Net Income", "$2,650.00"],
  ];

  it("PNL-01 · the 'Total X' layout parses: all three section totals captured, computed rows never become lines", () => {
    const p = parsePnlRows(sheet());
    expect(p.incomeTotal).toBe(15000);
    expect(p.cogsTotal).toBe(6000);
    expect(p.expenseTotal).toBe(6350);
    expect(p.currentLabel).toBe("Oct 2026");
    expect(p.lines.map((l) => l.name)).toEqual(["Fuel", "Maintenance & Repairs", "Payroll", "Insurance"]);
    expect(p.lines.map((l) => l.section)).toEqual(["cogs", "cogs", "expenses", "expenses"]);
    expect(p.warnings).toEqual([]);
    expect(p.errors).toEqual([]);
  });

  it("PNL-02 · a total the file did not carry is summed from its lines and SAID, never left null", () => {
    const p = parsePnlRows(sheet({ cogsTotal: false }));
    expect(p.cogsTotal).toBe(6000); // derived: 5,000 + 1,000
    expect(p.warnings.join(" ")).toContain("Cost of Goods Sold");
    expect(p.errors).toEqual([]);
  });

  it("PNL-04 · a file that disagrees with itself is an error, so the month is never saved", () => {
    const p = parsePnlRows(sheet({ expenseTotalValue: "$9,999.00" }));
    expect(p.errors.length).toBeGreaterThan(0);
    expect(p.errors.join(" ")).toContain("Expenses");
  });

  it("BASIS-02 · a month missing cogs_total is unfiled: the ladder equals the book with October removed entirely", () => {
    const book = syntheticBook();
    const oct = book.periods[5];
    expect(oct.period_month).toBe("2026-10-01");
    const broken = targetsOf(book, [...book.periods.slice(0, 5), brokenPeriod(oct, { cogs_total: null })]);
    const removed = targetsOf(book, book.periods.slice(0, 5));
    expect(broken.basis.months).toBe(5);
    expect(broken.bookingLadder.breakEven).not.toBeNull();
    for (const k of ["breakEven", "minimum", "target", "prime"] as const)
      expect(broken.bookingLadder[k] as number).toBeCloseTo(removed.bookingLadder[k] as number, 6);
    for (const k of ["breakEven", "minimum", "target", "prime"] as const)
      expect(broken.specLadder[k] as number).toBeCloseTo(removed.specLadder[k] as number, 6);
  });

  it("BASIS-02 · …and it is NAMED, so the page can say which month is missing", () => {
    const book = syntheticBook();
    const t = targetsOf(book, [...book.periods.slice(0, 5), brokenPeriod(book.periods[5], { cogs_total: null })]);
    expect(t.basis.missingLabel).toBe("Oct ’26");
    expect(t.basis.windowLabel).toBe("May–Sep ’26");
  });

  it("BASIS-02 · EITHER total missing is unfiled: a null expense_total reads the same as a null cogs_total", () => {
    const book = syntheticBook();
    const nullCogs = targetsOf(book, [...book.periods.slice(0, 5), brokenPeriod(book.periods[5], { cogs_total: null })]);
    const nullExp = targetsOf(book, [
      ...book.periods.slice(0, 5),
      brokenPeriod(book.periods[5], { cogs_total: book.periods[5].cogs_total, expense_total: null }),
    ]);
    expect(nullExp.basis.missingLabel).toBe("Oct ’26");
    expect(nullExp.bookingLadder.breakEven as number).toBeCloseTo(nullCogs.bookingLadder.breakEven as number, 6);
  });

  it("control: the ladder is NOT what a free October would give (the incident's wrong answer)", () => {
    const book = syntheticBook();
    const freeOct = targetsOf(book, [
      ...book.periods.slice(0, 5),
      { ...book.periods[5], cogs_total: 0, expense_total: 0 },
    ]);
    const filed = targetsOf(book);
    expect(freeOct.bookingLadder.breakEven as number).toBeLessThan((filed.bookingLadder.breakEven as number) - 0.2);
  });
});

describe("MKT-08 · 2026-11-01 (v1.236.0 read the gap) · copied start readings never grade a reload free", () => {
  const book = syntheticBook();
  const t = targetsOf(book);
  const seq = sequenceLoads(book.loads, book.trips);

  it("every next leg whose next window exceeds its loaded miles has deadhead > 0 from the odometer", () => {
    const byId = new Map(book.loads.map((l) => [l.load_id, l]));
    let checked = 0;
    seq.forEach((s, i) => {
      const nextLoad = seq[i + 1]?.load;
      if (!s.next || !nextLoad) return;
      const win = (nextLoad.odometer_end as number) - (nextLoad.odometer_start as number);
      if (win <= nextLoad.loaded_miles) return;
      checked++;
      expect(s.next.deadheadMiles).toBeGreaterThan(0);
      expect(s.next.deadheadSource).toBe("odometer");
      // the empty run is the window's excess over the loaded miles — what the owner's chain actually shows
      expect(s.next.deadheadMiles).toBe(win - nextLoad.loaded_miles);
      expect(byId.has(nextLoad.load_id)).toBe(true);
    });
    expect(checked).toBe(31); // every delivered load but the last has a next
  });

  it("the home leg (after the logged home trip) is marked home and kept out of the yardstick", () => {
    expect(seq.filter((s) => s.home)).toHaveLength(1);
    expect(seq.find((s) => s.home)?.load.load_number).toBe("9100018");
  });

  it("the IN yardstick's median reload is positive (the gap reading made it 0)", () => {
    // derived: the median of the 30 non-home next-leg empties
    expect(reloadYardstick(seq)).toBeGreaterThan(0);
    expect(reloadYardstick(seq)).toBe(13);
  });

  it("the ledger's IN half prints a positive reload and a positive reload cost for every market", () => {
    const rows = buildLedger(book.loads, "all", now, "state", book.trips, gradeCostsOf(t));
    expect(rows.length).toBeGreaterThan(4);
    for (const r of rows) {
      expect(r.in.reloadMilesMedian).toBeGreaterThan(0);
      expect(r.in.reloadCostMedian).toBeGreaterThan(0);
    }
  });
});

describe("CASH-06 · PACE-02 · DAY-02 · a planned delivery is expected, never delivered — on every surface", () => {
  // One definition of "delivered" and "never revenue": lib/metrics/status.ts.
  // No other module under src/lib or src/hooks may compare load_status to
  // 'delivered', or build its own Set that lists "invoiced" (a payment_status).
  it("no module outside lib/metrics/status.ts redefines delivered or the never-revenue set", () => {
    const root = resolve(process.cwd(), "src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
      });
    const files = [...walk(join(root, "lib")), ...walk(join(root, "hooks"))].filter(
      (p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && relative(root, p) !== join("lib", "metrics", "status.ts"),
    );
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((p) => {
      const src = readFileSync(p, "utf8");
      return /load_status\s*===\s*"delivered"/.test(src) || /new Set\(\s*\[[^\]]*"invoiced"/.test(src);
    });
    expect(offenders.map((p) => relative(root, p)), "redefines delivered / never-revenue outside lib/metrics/status.ts").toEqual([]);
  });
  const book = syntheticBook();
  const onRoad = book.loads.filter(isOnTheRoad);
  const bookedLoad = book.loads.find((l) => l.load_status === "booked") as Load;
  const roadLoad = book.loads.find((l) => l.load_status === "in_transit") as Load;
  // The same book without the two loads still on the road: every surface that
  // stays blind to them must read exactly the same.
  const bare = (): Book => {
    const b = syntheticBook();
    b.loads = b.loads.filter((l) => !isOnTheRoad(l));
    return b;
  };
  // …and the book where the planned dates had been taken as deliveries.
  const asDelivered = (): Book => {
    const b = syntheticBook();
    for (const l of b.loads) if (isOnTheRoad(l)) l.load_status = "delivered";
    return b;
  };

  it("the book carries one booked and one in-transit load whose PLANNED delivery is already past", () => {
    expect(onRoad).toHaveLength(2);
    expect(String(bookedLoad.delivery_date) < TODAY).toBe(true);
    expect(String(roadLoad.delivery_date) < TODAY).toBe(true);
  });

  it("the cash board: absent from every closed period's delivered set, present only as EXPECTED in the open one", () => {
    const board = buildCashBoard(cashInput(book));
    const input = { ...cashInput(book), settlements: [] };
    const oct21 = depositForWeek(input, { start: "2026-10-21", end: "2026-10-27" }); // the booked load's planned week
    const oct28 = depositForWeek(input, { start: "2026-10-28", end: "2026-11-03" }); // the in-transit load's planned week
    expect([oct21.loads, oct21.booked, oct21.inTransit]).toEqual([1, 0, 0]);
    expect([oct28.loads, oct28.booked, oct28.inTransit]).toEqual([1, 0, 0]);
    const cur = board?.columns[0].deposit;
    expect([cur?.loads, cur?.booked, cur?.inTransit]).toEqual([0, 1, 1]);
    // derived: 2,975.00 + 2,809.00 — shown as expected, not as delivered net
    expect(cur?.expectedNet).toBeCloseTo(5784, 2);
    expect(cur?.loadsNet).toBe(0);
    expect(board?.columns[1].deposit.booked).toBe(0);
    expect(board?.columns[1].deposit.inTransit).toBe(0);
  });

  it("the cash board's closed deposits equal the book without those two loads", () => {
    const a = { ...cashInput(book), settlements: [] };
    const b = { ...cashInput(bare()), settlements: [] };
    for (let k = 1; k <= 30; k++) {
      const w = payWeekOf(new Date(Date.parse(`${TODAY}T00:00:00Z`) - 7 * 86400000 * k).toISOString().slice(0, 10));
      expect(depositForWeek(a, w).amount).toBeCloseTo(depositForWeek(b, w).amount!, 2);
    }
  });

  it("week earned (getWeekGrossEarned) counts delivered freight only; committed and pipeline carry the rest", () => {
    // week Oct 21–27 holds the booked load's planned day; week Oct 28–Nov 3 the in-transit load's
    const wk1 = [new Date("2026-10-21T00:00:00Z"), new Date("2026-10-28T00:00:00Z")] as const;
    const wk2 = [new Date("2026-10-28T00:00:00Z"), new Date("2026-11-04T00:00:00Z")] as const;
    // derived: 9100031 delivered Oct 27 gross 3,300 + 400 + 150 = 3,850 · booked 9100033 gross 3,920
    expect(getWeekGrossEarned(book.loads, wk1[0], wk1[1])).toBeCloseTo(3850, 2);
    expect(getWeekGrossCommitted(book.loads, wk1[0], wk1[1])).toBeCloseTo(3850 + loadGross(bookedLoad), 2);
    expect(getWeekGrossPipeline(book.loads, wk1[0], wk1[1])).toBeCloseTo(3920, 2);
    // derived: 9100032 delivered Nov 3 gross 4,150 + 500 = 4,650 · in-transit 9100034 gross 3,700
    expect(getWeekGrossEarned(book.loads, wk2[0], wk2[1])).toBeCloseTo(4650, 2);
    expect(getWeekGrossPipeline(book.loads, wk2[0], wk2[1])).toBeCloseTo(3700, 2);
    expect(getWeekGrossEarned(book.loads, wk2[0], wk2[1])).toBeCloseTo(getWeekGrossEarned(bare().loads, wk2[0], wk2[1]), 2);
  });

  it("completed pay-week totals (best week, streaks) ignore them", () => {
    expect(completedPayWeekTotals(book.loads, TODAY)).toEqual(completedPayWeekTotals(bare().loads, TODAY));
  });

  it("monthMiles ignores them: October and November read as the book without them, and differ from the 'delivered' misreading", () => {
    for (const month of [9, 10]) {
      expect(monthMiles(book.loads, 2026, month)).toEqual(monthMiles(bare().loads, 2026, month));
    }
    // derived: Nov holds only 9100032 (800 loaded); the in-transit load's planned Nov 2 would add 560
    expect(monthMiles(book.loads, 2026, 10).loaded).toBe(800);
    // derived: October's five delivered loads = 3,430 loaded mi; the booked load's planned Oct 22 would add 665
    expect(monthMiles(book.loads, 2026, 9).loaded).toBe(3430);
    expect(monthMiles(asDelivered().loads, 2026, 9).loaded).toBe(3430 + 665);
    expect(monthMiles(asDelivered().loads, 2026, 10).loaded).toBe(800 + 560);
  });

  it("the dashboard's revenue helpers ignore them", () => {
    // derived: November so far = 9100032's net, 3,529.50
    expect(getRevenueMTD(book.loads, now)).toBeCloseTo(3529.5, 2);
    expect(getRevenueMTD(book.loads, now)).toBeCloseTo(getRevenueMTD(bare().loads, now) as number, 2);
    // derived: October = 5 delivered loads' net 15,819.00; the booked load's net 2,975.00 is NOT in it
    expect(getRevenueLastMonth(book.loads, now)).toBeCloseTo(15819, 2);
    expect(getRevenueYTD(book.loads, now)).toBeCloseTo(getRevenueYTD(bare().loads, now) as number, 2);
    expect(getMonthlyRevenue(book.loads, 12, now)).toEqual(getMonthlyRevenue(bare().loads, 12, now));
  });

  it("DAY-02 · $/day roll-ups count delivered loads only: the whole book reads as the delivered loads alone", () => {
    const delivered = book.loads.filter((l) => l.load_status === "delivered");
    expect(perDayOver(book.loads)).toEqual(perDayOver(delivered));
    expect(perDayOver(book.loads).loads).toBe(32);
  });

  it("the ledger's sequence is the 32 delivered loads, not 34", () => {
    expect(sequenceLoads(book.loads, book.trips)).toHaveLength(32);
  });
});

describe("CASH-03 · 2026-11-04 · a closed period keeps every delivered load whatever payment_status says", () => {
  const flipped = (): Book => {
    const b = syntheticBook();
    for (const l of b.loads) l.payment_status = l.payment_status === "paid" ? "unpaid" : "paid";
    return b;
  };
  const closedWeeks = () => {
    const out = [];
    for (let k = 1; k <= 30; k++)
      out.push(payWeekOf(new Date(Date.parse(`${TODAY}T00:00:00Z`) - 7 * 86400000 * k).toISOString().slice(0, 10)));
    return out;
  };

  it("every closed period's deposit is identical with the paid flag flipped on every load", () => {
    const a = cashInput(syntheticBook());
    const b = cashInput(flipped());
    for (const w of closedWeeks()) {
      expect(w.end < TODAY).toBe(true);
      expect(depositForWeek(b, w).amount).toBeCloseTo(depositForWeek(a, w).amount!, 2);
    }
  });

  it("…also when the deposit is projected from the loads (no statement in the vault)", () => {
    const a = { ...cashInput(syntheticBook()), settlements: [] };
    const b = { ...cashInput(flipped()), settlements: [] };
    for (const w of closedWeeks()) expect(depositForWeek(b, w).amount).toBeCloseTo(depositForWeek(a, w).amount!, 2);
  });
});

describe("MKT-01 · DIAL-02 · 2026-11-01 · a fuel move never moves a dial", () => {
  // The index up ~4% over three months for two prints running, diesel up ~12%
  // the same way: the freight market did not move, the fuel price did.
  const index: SeriesPoint[] = [
    { month: "2026-04", value: 100 },
    { month: "2026-05", value: 100 },
    { month: "2026-06", value: 100 },
    { month: "2026-07", value: 102 },
    { month: "2026-08", value: 103.5 }, // +3.5% on May
    { month: "2026-09", value: 104 }, // +4.0% on June
  ];
  const diesel: SeriesPoint[] = [
    { month: "2026-05", value: 4.2 },
    { month: "2026-06", value: 4.25 },
    { month: "2026-07", value: 4.5 },
    { month: "2026-08", value: 4.7 },
    { month: "2026-09", value: 4.76 }, // +12.0% on June, the same way
  ];
  const book = syntheticBook();
  const t = targetsOf(book);
  const std = 0.35;
  const spec = 0.45;

  it("marketSignal sees a held index move, and calls it fuel-driven", () => {
    const s = marketSignal(index, diesel);
    expect(s?.raw).toBe("firming");
    expect(s?.pctChange).toBeCloseTo(0.04, 4);
    expect(s?.prints).toBe(2);
    expect(s?.holds).toBe(true);
    expect(s?.dieselPct).toBeCloseTo(0.12, 3);
    expect(s?.fuelDriven).toBe(true);
    expect(s?.direction).toBe("flat"); // the usable direction: no rate call
  });

  it("dialAdvice says hold with zero deltas", () => {
    const a = dialAdvice(marketSignal(index, diesel), t.marginGoal, std, spec);
    expect(a.hold).toBe(true);
    expect(a.fuelDriven).toBe(true);
    expect(a.stdDelta).toBe(0);
    expect(a.specDelta).toBe(0);
    expect(a.headline).toContain("fuel move");
  });

  it("the market call never says raise, on either tier", () => {
    const call = buildMarketCall(ratePoints(book.loads), t.bookingLadder, t.specLadder, marketSignal(index, diesel), now);
    expect(call.tiers).toHaveLength(2);
    for (const tier of call.tiers) expect(tier.action).not.toBe("raise");
  });

  it("control: the SAME index with no diesel move IS a rate call — the dial steps up one notch (2 pts)", () => {
    const s = marketSignal(index, []);
    expect(s?.fuelDriven).toBe(false);
    expect(s?.direction).toBe("firming");
    const a = dialAdvice(s, t.marginGoal, std, spec);
    expect(a.hold).toBe(false);
    expect(a.stdDelta).toBeCloseTo(0.02, 4);
  });
});
