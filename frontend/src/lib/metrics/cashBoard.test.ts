import { describe, it, expect } from "vitest";
import { buildCashBoard, netPayForWeek, fuelForWeek, type CashBoardInput, type CashCheck } from "./cashBoard";
import { collectReadings } from "./odometer";
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import type { SettlementSummary } from "@/types/settlement";

// The sheet's numbers (rev 3, 2026-09-30): the Sep 18 and Sep 25 snapshots,
// the Wed Sep 30 Ops check, September's loads, fills and readings, the Sep 23
// statement in the feed, the 18 calendar bills.
const bill = (label: string, category: Obligation["category"], amount: number, day: number, draft: number | null = null): Obligation =>
  ({ label, category, amount, draft_amount: draft, day_of_month: day, active: true, is_draw: false, on_pl: true }) as unknown as Obligation;
const bills: Obligation[] = [
  bill("Google", "other", 16.8, 2), bill("Prepass", "other", 200, 4), bill("Health Ins", "insurance", 380.45, 4),
  bill("Intuit", "other", 119.23, 6), bill("Claude", "other", 100, 7), bill("Canva", "other", 20, 7),
  bill("Analysis Ch", "other", 20, 9), bill("Railway", "other", 20, 14), bill("Accounting", "other", 75, 15),
  bill("Hostinger", "other", 24.99, 17), bill("Internet", "other", 130, 18), bill("Parking", "other", 75, 18),
  bill("Best Egg", "loan_lease", 200, 19, 358.97), bill("Dental Ins", "insurance", 30.44, 20),
  bill("Truck Note", "loan_lease", 1200, 26, 1575), bill("Guarantee fee", "other", 900, 27),
  bill("Trailer Payment", "loan_lease", 300, 27, 475.19), bill("Phone", "other", 341, 29),
];
const load = (n: string, pu: string, del: string, net: number, status = "delivered", pay = "invoiced", odo: [number | null, number | null] = [null, null]): Load =>
  ({ load_number: n, load_status: status, payment_status: pay, pickup_date: pu, delivery_date: del, net_revenue: String(net), loaded_miles: 0, deadhead_miles: 0, odometer_start: odo[0], odometer_end: odo[1] }) as unknown as Load;
const loads: Load[] = [
  load("8336008", "2026-09-14", "2026-09-17", 4000, "delivered", "paid", [599893, 601595]),
  load("7330381", "2026-09-18", "2026-09-21", 3281.4, "delivered", "paid", [601595, 603224]),
  load("2990007", "2026-09-22", "2026-09-23", 2149, "delivered", "invoiced", [603229, 603845]),
  load("7520182", "2026-09-23", "2026-09-24", 1312.62, "delivered", "invoiced", [603845, 604222]),
  load("5165757", "2026-09-25", "2026-09-28", 3440.6, "delivered", "invoiced", [604222, 605222]),
  load("1380689", "2026-09-29", "2026-10-01", 3080.76, "in_transit", "unpaid", [605222, null]),
  load("1572011", "2026-10-01", "2026-10-01", 809, "booked", "unpaid"),
];
// the loads' own miles, for the open-week projection
const setMiles = (l: Load, loaded: number, dead: number) => {
  (l as unknown as { loaded_miles: number; deadhead_miles: number }).loaded_miles = loaded;
  (l as unknown as { loaded_miles: number; deadhead_miles: number }).deadhead_miles = dead;
};
setMiles(loads[2], 539, 14); // 2990007 — Sep 16–22 by pickup
setMiles(loads[3], 244, 93); // 7520182
setMiles(loads[4], 752, 18); // 5165757
(loads[6] as unknown as { loaded_miles: number; deadhead_miles: number }).loaded_miles = 137;
(loads[6] as unknown as { loaded_miles: number; deadhead_miles: number }).deadhead_miles = 44;
(loads[5] as unknown as { loaded_miles: number; deadhead_miles: number }).loaded_miles = 804;
(loads[5] as unknown as { loaded_miles: number; deadhead_miles: number }).deadhead_miles = 88;
const fuel = [
  { fuel_date: "2026-09-14", gallons: 124.227, price_per_gallon: 5.565, odometer_reading: 600259 },
  { fuel_date: "2026-09-16", gallons: 117.806, price_per_gallon: 5.735, odometer_reading: 601069 },
  { fuel_date: "2026-09-17", gallons: 96.032, price_per_gallon: 6.069, odometer_reading: 601652 },
  { fuel_date: "2026-09-19", gallons: 140.102, price_per_gallon: 5.846, odometer_reading: 602516 },
  { fuel_date: "2026-09-22", gallons: 129.91, price_per_gallon: 5.619, odometer_reading: 603232 },
  { fuel_date: "2026-09-23", gallons: 122.561, price_per_gallon: 5.625, odometer_reading: 604001 },
  { fuel_date: "2026-09-27", gallons: 124.109, price_per_gallon: 5.153, odometer_reading: 604738 },
];
const settlements: SettlementSummary[] = [
  { settlement_id: "s923", period_ending: "2026-09-23", revenue: 7671.15, refunds: 170, deductions: 3180.54, net: "4660.61", escrow_tractor: null, escrow_trailer: null, ytd_earnings: null, server_url: "", loads: 6, advances: 3000, adjustments: [], unmatched_loads: [] },
];
const checks: CashCheck[] = [
  { date: "2026-09-18", balance: 8575, kind: "snapshot", note: "Moved vault money to tax obligation", miles: null, maintenance: 1161, settlesMonth: null },
  { date: "2026-09-25", balance: 9927.54, kind: "snapshot", note: "Settlement + payroll landed", miles: 1999, maintenance: 1801.51, settlesMonth: null },
  { date: "2026-09-30T00:00:00.000Z", balance: 7309.08, kind: "check", note: "before Friday's payroll and the accrual" },
];
const input = (over: Partial<CashBoardInput> = {}): CashBoardInput => ({
  today: "2026-09-30", settlementDay: 3, depositLagDays: 1, floatLine: 10000,
  checks, loads, settlements, fuelEntries: fuel, obligations: bills,
  readings: collectReadings(fuel, loads, []),
  weeklyPayroll: 1908, perMile: 0.32, fuelPaceWeekly: 1959, fuelFallback: 1269.44,
  buckets: { firstOfMonth: 685, standard: 172, samples: 12 }, deductionsFallback: 361.99, weeklyRevenueFallback: 4647,
  moneyDays: [], overrides: {},
  ...over,
});

describe("fuelForWeek — actual once the week closes, the pace while it's open, never under the fills so far", () => {
  it("last week (closed): the two fills, $1,329, on the Sep 30 statement, cash Thu Oct 1", () => {
    const f = fuelForWeek(fuel, { start: "2026-09-23", end: "2026-09-29" }, "2026-09-30", 1959, 1269.44, 3, 1);
    expect(f).toMatchObject({ amount: 1328.94, source: "actual", fills: 2, statementDate: "2026-09-30", depositDate: "2026-10-01" });
  });
  it("this week (open): the pace, no fill yet, on the Oct 7 statement", () => {
    const f = fuelForWeek(fuel, { start: "2026-09-30", end: "2026-10-06" }, "2026-09-30", 1959, 1269.44, 3, 1);
    expect(f).toMatchObject({ amount: 1959, source: "pace", fills: 0, soFar: 0, statementDate: "2026-10-07", depositDate: "2026-10-08" });
  });
  it("an open week whose fills already beat the pace uses the fills", () => {
    const heavy = [...fuel, { fuel_date: "2026-09-30", gallons: 200, price_per_gallon: 6, odometer_reading: 606000 }, { fuel_date: "2026-10-01", gallons: 200, price_per_gallon: 6, odometer_reading: 606800 }];
    expect(fuelForWeek(heavy, { start: "2026-09-30", end: "2026-10-06" }, "2026-10-02", 1959, 0, 3, 1).amount).toBe(2400);
  });
  it("no pace yet → the hand-set fallback", () => {
    expect(fuelForWeek([], { start: "2026-10-07", end: "2026-10-13" }, "2026-09-30", null, 1269.44, 3, 1)).toMatchObject({ amount: 1269.44, source: "pace" });
  });
});

describe("netPayForWeek — the week's own Wednesday statement", () => {
  it("last week: 3 loads $6,902 − its fuel $1,329 − bucket $172 = $5,401, lands Thu Oct 1", () => {
    const n = netPayForWeek(input(), { start: "2026-09-23", end: "2026-09-29" });
    expect(n).toMatchObject({ statementDate: "2026-09-30", depositDate: "2026-10-01", source: "projected", loads: 3, loadsNet: 6902.22, fuel: 1328.94, bucket: 172, bucketKind: "standard" });
    expect(n.amount).toBeCloseTo(5401.28, 2);
  });
  it("a typed override beats the projection — you said $4,715", () => {
    const n = netPayForWeek(input({ overrides: { "2026-09-30": 4715 } }), { start: "2026-09-23", end: "2026-09-29" });
    expect(n).toMatchObject({ amount: 4715, source: "override", loadsNet: 6902.22 });
  });
  it("the statement on file wins, with its advances beside the fills", () => {
    const n = netPayForWeek(input(), { start: "2026-09-16", end: "2026-09-22" });
    expect(n).toMatchObject({ statementDate: "2026-09-23", amount: 4660.61, source: "actual", advances: 3000 });
  });
  it("this week: nothing delivered yet — 1 in transit + 1 booked EXPECTED $3,890 − fuel at pace $1,959 − first-of-month bucket $685 = $1,246", () => {
    const n = netPayForWeek(input(), { start: "2026-09-30", end: "2026-10-06" });
    expect(n).toMatchObject({ statementDate: "2026-10-07", loads: 0, inTransit: 1, booked: 1, bucketKind: "first", bucket: 685, fuelSource: "pace" });
    expect(n.expectedNet).toBeCloseTo(3889.76, 2);
    expect(n.amount).toBeCloseTo(1245.76, 2);
  });
  it("a closed week gets nothing from a load that didn't deliver into it", () => {
    const stuck = loads.map((l) => (l.load_number === "5165757" ? ({ ...l, load_status: "in_transit", payment_status: "unpaid" } as Load) : l));
    const n = netPayForWeek(input({ loads: stuck }), { start: "2026-09-23", end: "2026-09-29" });
    expect(n).toMatchObject({ loads: 2, inTransit: 0, booked: 0 });
    expect(n.loadsNet).toBeCloseTo(2149 + 1312.62, 2);
  });
  it("next week: nothing booked yet → the weekly fallback less fuel and the bucket", () => {
    const n = netPayForWeek(input(), { start: "2026-10-07", end: "2026-10-13" });
    expect(n).toMatchObject({ statementDate: "2026-10-14", source: "fallback", loads: 0 });
    expect(n.amount).toBeCloseTo(4647 - 1959 - 172, 2);
  });
  it("a closed week with nothing delivered earned nothing — no fallback", () => {
    const n = netPayForWeek(input({ loads: [] }), { start: "2026-09-23", end: "2026-09-29" });
    expect(n.source).toBe("projected");
    expect(n.amount).toBeCloseTo(0 - 1328.94 - 172, 2);
  });

  // Jason marks a load paid by hand the morning its cash lands, before the
  // statement PDF reaches the vault. The week must still own it.
  it("marking the week's loads paid does not empty the week's own net pay", () => {
    const paid = loads.map((l) => ({ ...l, payment_status: "paid" }) as Load);
    const n = netPayForWeek(input({ loads: paid }), { start: "2026-09-23", end: "2026-09-29" });
    expect(n).toMatchObject({ source: "projected", loads: 3, loadsNet: 6902.22 });
    expect(n.amount).toBeCloseTo(5401.28, 2);
  });
});

describe("buildCashBoard — Wed Sep 30, the board in Jason's frame", () => {
  const board = buildCashBoard(input({ overrides: { "2026-09-30": 4715 } }))!;
  const [before, last, thisWk, next] = board.weeks;

  it("frames four pay weeks, each with its own Thursday-to-Wednesday cash days, based on the Sep 18 snapshot", () => {
    expect(before.week).toEqual({ start: "2026-09-16", end: "2026-09-22" });
    expect(before.cycle).toEqual({ start: "2026-09-24", end: "2026-09-30" });
    expect(last.week).toEqual({ start: "2026-09-23", end: "2026-09-29" });
    expect(last.cycle).toEqual({ start: "2026-10-01", end: "2026-10-07" });
    expect(thisWk.cycle).toEqual({ start: "2026-10-08", end: "2026-10-14" });
    expect(next.cycle).toEqual({ start: "2026-10-15", end: "2026-10-21" });
    expect([before.state, last.state, thisWk.state, next.state]).toEqual(["done", "closed", "open", "future"]);
    expect(board.base.date).toBe("2026-09-18");
  });

  it("the week before: opened Thu Sep 24 at $8,186, its own deposit $4,660.61 actual, both checks with their gaps, ends on the Sep 30 check", () => {
    expect(before.opening).toBeCloseTo(8575 - 358.97 - 30.44, 2);
    expect(before.netPay).toMatchObject({ statementDate: "2026-09-23", depositDate: "2026-09-24", amount: 4660.61, source: "actual" });
    expect(before.accrual).toMatchObject({ source: "snapshot", miles: 1999, alreadyMoved: true });
    expect(before.billsTotal).toBeCloseTo(1575 + 900 + 475.19 + 341, 2);
    const snap = before.checks.find((c) => c.date === "2026-09-25")!;
    expect(snap.projected).toBeCloseTo(8185.59 + 4660.61 - 1908 - 639.68, 2);
    expect(snap.gap).toBeCloseTo(-370.98, 2);
    const chk = before.checks.find((c) => c.date === "2026-09-30")!;
    expect(chk.projected).toBeCloseTo(6636.35, 2);
    expect(chk.gap).toBeCloseTo(672.73, 2);
    expect(before.ending).toBe(7309.08);
  });

  it("last week: opens Thu Oct 1 on the Sep 30 Ops check, its own deposit is the $4,715 you said, its accrual $637 by odometer on Fri Oct 2, ends Wed Oct 7 at $8,643", () => {
    expect(last.openingCheck).toMatchObject({ kind: "check", balance: 7309.08, date: "2026-09-30" });
    expect(last.opening).toBe(7309.08);
    expect(last.netPay).toMatchObject({ statementDate: "2026-09-30", depositDate: "2026-10-01", amount: 4715, source: "override", loads: 3 });
    expect(last.netPay.loadsNet).toBeCloseTo(6902.22, 2);
    expect(last.accrual).toMatchObject({ source: "odometer", miles: 1990, date: "2026-10-02", weekLabel: "Sep 23–29" });
    expect(last.accrual.amount).toBeCloseTo(636.8, 2);
    expect(last.accrual.words).toBe("1,990 mi by odometer (603,232 on Sep 22 → 605,222 on Sep 29) × $0.32 · loads said 1,999");
    expect(last.billsTotal).toBeCloseTo(16.8 + 200 + 380.45 + 119.23 + 100 + 20, 2);
    expect(last.ending).toBeCloseTo(7309.08 + 4715 - 1908 - 636.8 - 836.48, 2);
  });

  it("this week: nothing delivered yet, two loads expected; its deposit lands Thu Oct 8; ends Wed Oct 14", () => {
    expect(thisWk.opening).toBeCloseTo(last.ending!, 2);
    expect(thisWk.netPay).toMatchObject({ statementDate: "2026-10-07", depositDate: "2026-10-08", source: "projected", loads: 0, inTransit: 1, booked: 1 });
    expect(thisWk.netPay.amount).toBeCloseTo(1245.76, 2);
    expect(thisWk.accrual).toMatchObject({ miles: 181, date: "2026-10-09", weekLabel: "Sep 30–Oct 6" });
    expect(thisWk.accrual.amount).toBeCloseTo(57.92, 2);
    expect(thisWk.billsTotal).toBeCloseTo(20 + 20, 2);
    expect(thisWk.ending).toBeCloseTo(last.ending! + 1245.76 - 1908 - 57.92 - 40, 2);
  });

  it("next week: the weekly fallback lands Thu Oct 15; ends Wed Oct 21", () => {
    expect(next.netPay).toMatchObject({ statementDate: "2026-10-14", depositDate: "2026-10-15", source: "fallback" });
    expect(next.billsTotal).toBeCloseTo(75 + 24.99 + 130 + 75 + 358.97 + 30.44, 2);
    expect(next.ending).toBeCloseTo(thisWk.ending! + (4647 - 1959 - 172) - 1908 - 694.4, 2);
  });

  it("the lowest point from today is today, under the float — hold", () => {
    expect(board.lowest).toEqual({ amount: 7309.08, date: "2026-09-30" });
    expect(board.clears).toBe(false);
  });

  it("the fuel row is the pay week's own: last actual $1,329 on the Sep 30 statement, this and next at pace", () => {
    expect(last.fuel).toMatchObject({ amount: 1328.94, source: "actual", statementDate: "2026-09-30", depositDate: "2026-10-01" });
    expect(thisWk.fuel).toMatchObject({ amount: 1959, source: "pace", depositDate: "2026-10-08" });
    expect(next.fuel).toMatchObject({ amount: 1959, source: "pace", depositDate: "2026-10-15" });
  });
});

describe("buildCashBoard — edges", () => {
  it("without the override last week's cash days end $686 higher — the projection's $5,401 lands instead", () => {
    const b = buildCashBoard(input())!;
    expect(b.weeks[1].netPay).toMatchObject({ source: "projected" });
    expect(b.weeks[1].ending).toBeCloseTo(7309.08 + 5401.28 - 1908 - 636.8 - 836.48, 2);
  });

  it("a snapshot whose Maintenance did NOT rise takes the accrual after the check", () => {
    const c = checks.map((x) => (x.date === "2026-09-25" ? { ...x, maintenance: 1161 } : x));
    const b = buildCashBoard(input({ checks: c }))!;
    expect(b.weeks[0].accrual.alreadyMoved).toBe(false);
    const chk = b.weeks[0].checks.find((x) => x.date === "2026-09-25")!;
    expect(chk.gap).toBeCloseTo(9927.54 - (8185.59 + 4660.61 - 1908), 2);
    // Tue Sep 29's end, before the Sep 30 check re-bases the cycle's last day.
    expect(b.weeks[0].days.find((d) => d.date === "2026-09-29")!.end).toBeCloseTo(9927.54 - 639.68 - 1575 - 900 - 475.19 - 341, 2);
  });

  it("a run money day's outflow leaves Ops on its snapshot's day", () => {
    const c: CashCheck[] = [...checks, { date: "2026-10-02", balance: 12000, kind: "snapshot", note: null, miles: 1990, maintenance: 2438, settlesMonth: "2026-08-01" }];
    const b = buildCashBoard(input({ checks: c, today: "2026-10-03", moneyDays: [{ date: "2026-10-02", amount: 500, label: "Money day · August 2026" }] }))!;
    const fri = b.weeks[1].days.find((d) => d.date === "2026-10-02")!;
    expect(fri.moneyDay?.amount).toBe(500);
    expect(b.weeks[1].moneyDays.length).toBe(1);
    // Maintenance rose 2,438 − 1,801.51 = 636.49 ≈ the $636.80 accrual → already moved, not taken again
    expect(b.weeks[1].accrual.alreadyMoved).toBe(true);
    expect(fri.end).toBeCloseTo(12000 - 500, 2);
  });

  it("no reading before a week → the loads' miles, and the words say so", () => {
    const b = buildCashBoard(input({ readings: [] }))!;
    expect(b.weeks[1].accrual.source).toBe("loads");
    expect(b.weeks[1].accrual.words).toContain("by loads");
  });

  it("no balances at all → no board", () => {
    expect(buildCashBoard(input({ checks: [] }))).toBeNull();
  });

  // A fat-fingered odometer (605,222 typed as 6,052,220) never goes
  // backwards, so the backwards rule can't see it — at the head of the chain
  // it lands as a 5.4-million-mile week and a seven-figure accrual with
  // nothing flagged. The board must say so.
  it("an odometer typed too HIGH flags the accrual instead of banking $1.7M", () => {
    const typo = [...fuel, { fuel_date: "2026-09-29", gallons: 1, price_per_gallon: 1, odometer_reading: 6052220 }];
    const b = buildCashBoard(input({ readings: collectReadings(typo, loads, []) }))!;
    const a = b.weeks[1].accrual;
    expect(a.backwards).toBe(0); // nothing goes DOWN — the old rule saw nothing
    expect(a.miles).toBe(6052220 - 603232);
    expect(a.implausibleMiles).toBe(6052220 - 603232);
    expect(a.amount).toBeCloseTo(1743676.16, 2);
    expect(a.flag).toContain("too high to be real");
  });

  it("a reading that goes backwards flags the accrual too — the same sentence", () => {
    const typo = [...fuel, { fuel_date: "2026-09-28", gallons: 1, price_per_gallon: 1, odometer_reading: 60522 }];
    const b = buildCashBoard(input({ readings: collectReadings(typo, loads, []) }))!;
    expect(b.weeks[1].accrual.backwards).toBe(1);
    expect(b.weeks[1].accrual.flag).toContain("goes backwards");
  });

  it("the loads fallback names itself in the flag", () => {
    const b = buildCashBoard(input({ readings: [] }))!;
    expect(b.weeks[1].accrual.flag).toContain("no odometer reading before the week");
  });

  it("a clean odometer week carries no flag", () => {
    const b = buildCashBoard(input())!;
    expect(b.weeks[1].accrual).toMatchObject({ source: "odometer", backwards: 0, implausibleMiles: null, flag: null });
  });

  // Issue 5: "every snapshot or Ops check that falls inside the week".
  it("a snapshot and an Ops check on the same day both print, each with its own gap", () => {
    const c: CashCheck[] = [...checks, { date: "2026-09-25", balance: 9500, kind: "check", note: "after the shop" }];
    const b = buildCashBoard(input({ checks: c }))!;
    const rows = b.weeks[0].checks.filter((x) => x.date === "2026-09-25");
    expect(rows.map((x) => x.kind)).toEqual(["snapshot", "check"]);
    expect(rows[0].gap).toBeCloseTo(-370.98, 2);
    // The second is measured against the first AS TYPED — the already-moved
    // accrual is not taken out twice.
    expect(rows[1].projected).toBeCloseTo(9927.54, 2);
    expect(rows[1].gap).toBeCloseTo(9500 - 9927.54, 2);
    expect(b.weeks[0].days.find((d) => d.date === "2026-09-25")!.checks).toHaveLength(2);
  });

  // Issue 4: each week's Friday gets the accrual the Plan page orders. A
  // Friday that passed with no snapshot still owes its week.
  it("a Friday that passed with no snapshot still accrues — the week is not skipped", () => {
    const b = buildCashBoard(input({ today: "2026-10-05", overrides: { "2026-09-30": 4715 } }))!;
    // Mon Oct 5: last week (Sep 23–29) owns Fri Oct 2, which passed with no snapshot.
    expect(b.weeks[1].week).toEqual({ start: "2026-09-23", end: "2026-09-29" });
    expect(b.weeks[1].accrual).toMatchObject({ source: "odometer", miles: 1990, weekLabel: "Sep 23–29" });
    expect(b.weeks[1].accrual.amount).toBeCloseTo(636.8, 2);
    expect(b.weeks[1].days.find((d) => d.date === "2026-10-02")!.accrual).toBeCloseTo(636.8, 2);
  });

  // Issue 9: one printed gap. OPS NOW reads `afterBank`, the same figure the
  // Checked row measures against — on a deposit day the morning is not it.
  it("afterBank is the day's comparison figure, deposit included", () => {
    const c: CashCheck[] = [...checks, { date: "2026-10-01", balance: 9000, kind: "check", note: null }];
    const b = buildCashBoard(input({ checks: c, overrides: { "2026-09-30": 4715 } }))!;
    const thu = b.days.find((d) => d.date === "2026-10-01")!;
    expect(thu.morning).toBeCloseTo(7309.08, 2);
    expect(thu.afterBank).toBeCloseTo(7309.08 + 4715, 2);
    expect(thu.checks[0].projected).toBeCloseTo(thu.afterBank!, 2);
    expect(thu.checks[0].gap).toBeCloseTo(9000 - (7309.08 + 4715), 2);
  });

  // The engine simulates from the base; the three assembled weeks start a
  // week later. OPS NOW reads `days`, so a day in between has a figure.
  it("the days map spans the base forward, wider than the three weeks", () => {
    const b = buildCashBoard(input())!;
    expect(b.days[0].date).toBe("2026-09-18");
    expect(b.days.at(-1)!.date).toBe("2026-10-21");
    const sep20 = b.days.find((d) => d.date === "2026-09-20")!;
    expect(sep20.afterBank).not.toBeNull();
  });
});
