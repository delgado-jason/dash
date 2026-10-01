import { describe, it, expect } from "vitest";
import { buildCashBoard, depositForWeek, fuelForWeek, accrualForWeek, statementDateOf, normalizeSettlementDay, type CashBoardInput, type CashCheck } from "./cashBoard";
import { collectReadings } from "./odometer";
import type { Load } from "@/types/load";
import type { Obligation } from "@/types/obligation";
import type { SettlementSummary } from "@/types/settlement";

// Thursday Oct 1, 2026 — Jason's spec, question by question. The current
// period is Sep 30–Oct 6; the Sep 30 statement (last period's money) landed
// this morning; the Ops number is the Sep 30 check.
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
const load = (n: string, pu: string, del: string, net: number, status: string, pay: string, odo: [number | null, number | null], miles: [number, number]): Load =>
  ({ load_number: n, load_status: status, payment_status: pay, pickup_date: pu, delivery_date: del, net_revenue: String(net), loaded_miles: miles[0], deadhead_miles: miles[1], odometer_start: odo[0], odometer_end: odo[1] }) as unknown as Load;
const loads: Load[] = [
  load("7330381", "2026-09-18", "2026-09-21", 3281.4, "delivered", "paid", [601595, 603224], [1130, 316]),
  load("2990007", "2026-09-22", "2026-09-23", 2149, "delivered", "paid", [603229, 603845], [539, 14]),
  load("7520182", "2026-09-23", "2026-09-24", 1312.62, "delivered", "paid", [603845, 604222], [244, 93]),
  load("5165757", "2026-09-25", "2026-09-28", 3440.6, "delivered", "paid", [604222, 605222], [752, 18]),
  load("1380689", "2026-09-29", "2026-10-01", 3080.76, "delivered", "invoiced", [605222, 606217], [804, 88]),
  load("1572011", "2026-10-01", "2026-10-01", 809, "in_transit", "unpaid", [606217, null], [137, 44]),
  load("1667237", "2026-10-02", "2026-10-02", 1200, "booked", "unpaid", [0, null], [300, 40]),
];
const fuel = [
  { fuel_date: "2026-09-22", gallons: 129.91, price_per_gallon: 5.619, odometer_reading: 603232 },
  { fuel_date: "2026-09-23", gallons: 122.561, price_per_gallon: 5.625, odometer_reading: 604001 },
  { fuel_date: "2026-09-27", gallons: 124.109, price_per_gallon: 5.153, odometer_reading: 604738 },
  { fuel_date: "2026-09-29", gallons: 100, price_per_gallon: 5.4554, odometer_reading: 605483 },
];
const sep30: SettlementSummary = { settlement_id: "s930", period_ending: "2026-09-30", revenue: 7841.09, refunds: 0, deductions: 3123, net: "4718.09", escrow_tractor: null, escrow_trailer: null, ytd_earnings: null, server_url: "", loads: 3, advances: 2875, adjustments: [], unmatched_loads: [] };
const SNAP925: CashCheck = { date: "2026-09-25", balance: 9927.54, kind: "snapshot", note: null };
const B930: CashCheck = { date: "2026-09-30", balance: 7309.08, kind: "check", note: "before Friday's payroll and the accrual" };
// The board slices every date — this one arrives as a timestamp on purpose.
const checks: CashCheck[] = [SNAP925, { ...B930, date: "2026-09-30T00:00:00.000Z" }];
const input = (over: Partial<CashBoardInput> = {}): CashBoardInput => ({
  today: "2026-10-01", settlementDay: 3, depositLagDays: 1, floatLine: 10000,
  checks, loads, settlements: [sep30], fuelEntries: fuel, obligations: bills,
  readings: collectReadings(fuel, loads, []),
  weeklyPayroll: 1908, perMile: 0.32, fuelPaceWeekly: 1959, fuelFallback: 1269.44, advanceDefault: 2000,
  buckets: { firstOfMonth: 685, standard: 172, samples: 12 }, deductionsFallback: 361.99, weeklyRevenueFallback: 4647,
  moneyDays: [], overrides: {},
  ...over,
});
const CUR = { start: "2026-09-30", end: "2026-10-06" };
const NEXT = { start: "2026-10-07", end: "2026-10-13" };
const PREV = { start: "2026-09-23", end: "2026-09-29" };
const PREV2 = { start: "2026-09-16", end: "2026-09-22" };

describe("the statement day", () => {
  it("the first settlement day after the period closes — Wednesday, whatever the stored column says when it's not a weekday", () => {
    expect(statementDateOf(CUR, 3)).toBe("2026-10-07");
    expect(statementDateOf(CUR, 5)).toBe("2026-10-09");
    expect(statementDateOf(CUR, NaN)).toBe("2026-10-07");
    expect(statementDateOf(CUR, 9)).toBe("2026-10-07");
    expect([normalizeSettlementDay(0), normalizeSettlementDay(6), normalizeSettlementDay(7), normalizeSettlementDay(null)]).toEqual([0, 6, 3, 3]);
  });
  it("a bad schedule never throws the board — it runs on Wednesday", () => {
    expect(buildCashBoard(input({ settlementDay: NaN }))!.columns[0].deposit.statementDate).toBe("2026-10-07");
  });
});

describe("fuelForWeek — the card, the advance, the Monday leftover", () => {
  it("last period: fills $1,875 actual, the statement's $2,875 of draws, $1,000 left on the card → Ops Mon Sep 28", () => {
    const f = fuelForWeek(input(), PREV);
    expect(f).toMatchObject({ spent: 1874.48, spentSource: "actual", fills: 3, advances: 2875, advancesSource: "actual" });
    expect(f.leftover).toMatchObject({ amount: 1000.52, date: "2026-09-28" });
  });
  it("the current period: nothing logged yet, so fuel runs at the pace and the advance is the $2,000 you borrow", () => {
    const f = fuelForWeek(input(), CUR, B930);
    expect(f).toMatchObject({ spent: 1959, spentSource: "pace", soFar: 0, advances: 2000, advancesSource: "assumed" });
    expect(f.leftover).toMatchObject({ amount: 41, date: "2026-10-05", counted: true });
  });
  it("fills that pass $2,000 become the advance — you borrow what the fuel costs — and the fuel figure is actual, not the pace", () => {
    const heavy = [...fuel, { fuel_date: "2026-09-30", gallons: 200, price_per_gallon: 6, odometer_reading: 606300 }, { fuel_date: "2026-10-01", gallons: 200, price_per_gallon: 6, odometer_reading: 607000 }];
    const f = fuelForWeek(input({ fuelEntries: heavy }), CUR);
    expect(f).toMatchObject({ spent: 2400, spentSource: "actual", advances: 2400, advancesSource: "fills" });
    expect(f.leftover.amount).toBe(0);
  });
  it("a pace above $2,000 with no fills yet: the fuel figure runs at the pace, but the advance stays the $2,000 until the fills pass it — nothing left on the card", () => {
    const f = fuelForWeek(input({ fuelPaceWeekly: 2087 }), CUR, B930);
    expect(f).toMatchObject({ spent: 2087, spentSource: "pace", advances: 2000, advancesSource: "assumed", soFar: 0 });
    expect(f.leftover.amount).toBe(0);
  });
  it("a closed period with no loads drew nothing — no advance, no leftover", () => {
    const f = fuelForWeek(input({ settlements: [] }), PREV, undefined, true);
    expect(f).toMatchObject({ spent: 1874.48, advances: 0, advancesSource: "none" });
    expect(f.leftover.amount).toBe(0);
  });
  it("the Monday leftover is money that's there by morning: before or on the day of the Ops number it's already inside it", () => {
    expect(fuelForWeek(input(), PREV, B930).leftover.counted).toBe(false);
    expect(fuelForWeek(input(), CUR, { ...B930, date: "2026-10-05" }).leftover.counted).toBe(false);
    expect(fuelForWeek(input(), CUR, { ...B930, date: "2026-10-04" }).leftover.counted).toBe(true);
  });
});

describe("depositForWeek — delivered loads − Landstar's cut + accessorials − the advance − the bucket", () => {
  it("last period: the statement is in — $4,718.09 actual, landing Thu Oct 1", () => {
    const d = depositForWeek(input(), PREV, B930);
    expect(d).toMatchObject({ statementDate: "2026-09-30", date: "2026-10-01", amount: 4718.09, source: "actual", loads: 3, counted: true });
  });
  it("the current period: 1 delivered + 1 in transit + 1 booked expected − $2,000 advance − first-of-month bucket, landing Thu Oct 8", () => {
    const d = depositForWeek(input(), CUR, B930);
    expect(d).toMatchObject({ statementDate: "2026-10-07", date: "2026-10-08", source: "projected", loads: 1, inTransit: 1, booked: 1, advances: 2000, bucketKind: "first" });
    expect(d.loadsNet).toBeCloseTo(3080.76, 2);
    expect(d.expectedNet).toBeCloseTo(809 + 1200, 2);
    expect(d.amount).toBeCloseTo(3080.76 + 2009 - 2000 - 685, 2);
  });
  it("a load still on the road is expected, never delivered — and a closed period gets nothing from it", () => {
    const stuck = loads.map((l) => (l.load_number === "5165757" ? ({ ...l, load_status: "in_transit", payment_status: "unpaid" } as Load) : l));
    const d = depositForWeek(input({ loads: stuck, settlements: [] }), PREV);
    expect(d).toMatchObject({ loads: 2, inTransit: 0, booked: 0, advances: 2000, advancesSource: "assumed" });
  });
  it("a closed period that delivered nothing earned nothing — and drew no advance, so it isn't −$2,172", () => {
    const d = depositForWeek(input({ loads: [], settlements: [] }), PREV);
    expect(d).toMatchObject({ amount: 0, source: "projected", loads: 0, advances: 0, advancesSource: "none" });
  });
  it("next period: nothing booked → the weekly fallback − the advance you'll borrow − the standard bucket", () => {
    const d = depositForWeek(input(), NEXT);
    expect(d).toMatchObject({ statementDate: "2026-10-14", date: "2026-10-15", source: "fallback", advances: 2000, advancesSource: "assumed" });
    expect(d.amount).toBeCloseTo(4647 - 2000 - 172, 2);
  });
  it("a typed figure beats the projection", () => {
    expect(depositForWeek(input({ overrides: { "2026-10-07": 1500 } }), CUR)).toMatchObject({ amount: 1500, source: "override" });
  });
});

describe("accrualForWeek — the period's own miles, paid the Friday after it closes", () => {
  it("last period by odometer: 605,483 on Sep 29 is the end reading, 2,251 mi, Fri Oct 2", () => {
    const a = accrualForWeek(input(), PREV, B930);
    expect(a).toMatchObject({ source: "odometer", date: "2026-10-02", counted: true });
    expect(a.miles).toBe(605483 - 603232);
  });
  it("the current period so far: the reading at Oct 1 less the reading at Sep 29, or the loads picked up, whichever is larger", () => {
    const a = accrualForWeek(input(), CUR, B930);
    expect(a.date).toBe("2026-10-09");
    expect(a.miles).toBe(606217 - 605483); // 734 by odometer beats 1572011's 181 + 1667237's 340
    expect(a.amount).toBeCloseTo(734 * 0.32, 2);
    expect(a.words).toContain("odometer 734 mi so far");
  });
});

describe("buildCashBoard — Thu Oct 1, two periods, the Ops number from Sep 30", () => {
  const board = buildCashBoard(input())!;
  const [cur, nxt] = board.columns;

  it("opens the current period on the Sep 30 check (its date sliced) and frames the next one after it", () => {
    expect(board.base).toMatchObject({ date: "2026-09-30", balance: 7309.08, kind: "check", note: "before Friday's payroll and the accrual" });
    expect(cur.week).toEqual(CUR);
    expect(nxt.week).toEqual(NEXT);
    expect([cur.state, nxt.state]).toEqual(["open", "future"]);
    expect(cur.opening).toBe(7309.08);
    expect(cur.since).toEqual([]); // the number is from inside this period — nothing older is owed
  });

  it("last period's $4,718.09 landed this morning, after the Ops number, so it goes in", () => {
    expect(cur.prevDeposit).toMatchObject({ date: "2026-10-01", amount: 4718.09, source: "actual", counted: true });
  });

  it("the current period: its deposit lands Oct 8, payroll Fri Oct 2, the accrual Fri Oct 9, bills Oct 2–6, $41 back from the card Mon Oct 5", () => {
    expect(cur.deposit.amount).toBeCloseTo(2404.76, 2);
    expect(cur.payroll).toMatchObject({ amount: 1908, date: "2026-10-02", counted: true });
    expect(cur.accrual.amount).toBeCloseTo(234.88, 2);
    expect(cur.bills.map((b) => b.label)).toEqual(["Google", "Prepass", "Health Ins", "Intuit"]);
    expect(cur.billsTotal).toBeCloseTo(716.48, 2);
    expect(cur.fuel.leftover).toMatchObject({ amount: 41, date: "2026-10-05", counted: true });
    expect(cur.ending).toBeCloseTo(7309.08 + 4718.09 + 2404.76 - 1908 - 234.88 - 716.48 + 41, 2);
  });

  it("the next period opens on the current ending; the fallback deposit, payroll, Oct 7–13's bills, $41 from the card; the accrual is nothing yet", () => {
    expect(nxt.opening).toBeCloseTo(cur.ending!, 2);
    expect(nxt.prevDeposit).toBeNull();
    expect(nxt.since).toEqual([]);
    expect(nxt.deposit.amount).toBeCloseTo(4647 - 2000 - 172, 2);
    expect(nxt.accrual).toMatchObject({ amount: 0, source: "none", date: "2026-10-16" });
    expect(nxt.bills.map((b) => b.label)).toEqual(["Claude", "Canva", "Analysis Ch"]);
    expect(nxt.ending).toBeCloseTo(cur.ending! + 2475 - 1908 - 140 + 41, 2);
  });

  it("the lower ending clears or fails the float", () => {
    expect(board.lowest).toBeCloseTo(cur.ending!, 2);
    expect(board.clears).toBe(true);
    expect(buildCashBoard(input({ floatLine: 12000 }))!.clears).toBe(false);
  });
});

describe("buildCashBoard — the Ops number's date decides what counts", () => {
  it("an Ops number typed Friday morning: yesterday's deposit is inside it; Friday's own payroll and draft still come off (on or after the date)", () => {
    const c: CashCheck[] = [...checks, { date: "2026-10-02", balance: 9000, kind: "check", note: null }];
    const b = buildCashBoard(input({ checks: c, today: "2026-10-02" }))!;
    const cur = b.columns[0];
    expect(b.base.date).toBe("2026-10-02");
    expect(cur.prevDeposit).toMatchObject({ amount: 4718.09, counted: false });
    expect(cur.payroll).toMatchObject({ date: "2026-10-02", counted: true });
    expect(cur.bills.find((x) => x.label === "Google")!.counted).toBe(true);
    expect(cur.bills.find((x) => x.label === "Prepass")!.counted).toBe(true);
    expect(cur.ending).toBeCloseTo(9000 + cur.deposit.amount - 1908 - cur.accrual.amount - 16.8 - 200 - 380.45 - 119.23 + 41, 2);
  });

  it("a Friday snapshot, taken after payroll and the drafts landed, already holds that Friday — the accrual you move after it still counts", () => {
    const c: CashCheck[] = [...checks, { date: "2026-10-02", balance: 9000, kind: "snapshot", note: null }];
    const b = buildCashBoard(input({ checks: c, today: "2026-10-02" }))!;
    const cur = b.columns[0];
    expect(cur.payroll).toMatchObject({ date: "2026-10-02", counted: false });
    expect(cur.bills.find((x) => x.label === "Google")!.counted).toBe(false);
    expect(cur.bills.find((x) => x.label === "Prepass")!.counted).toBe(true);
    expect(cur.accrual.counted).toBe(true);
    expect(cur.ending).toBeCloseTo(9000 + cur.deposit.amount - cur.accrual.amount - 200 - 380.45 - 119.23 + 41, 2);
  });

  it("an Ops number typed the day the deposit lands already holds it — nothing is added twice", () => {
    const c: CashCheck[] = [...checks, { date: "2026-10-01", balance: 12024.08, kind: "check", note: null }];
    const b = buildCashBoard(input({ checks: c }))!;
    const cur = b.columns[0];
    expect(cur.prevDeposit).toMatchObject({ date: "2026-10-01", amount: 4718.09, counted: false });
    expect(cur.ending).toBeCloseTo(12024.08 + 2404.76 - 1908 - 234.88 - 716.48 + 41, 2);
  });

  it("a Friday snapshot and an Ops check on the same day: the check, typed later, is the number", () => {
    const c: CashCheck[] = [...checks, { date: "2026-10-02", balance: 9000, kind: "snapshot", note: null }, { date: "2026-10-02", balance: 9100, kind: "check", note: null }];
    expect(buildCashBoard(input({ checks: c, today: "2026-10-02" }))!.base.balance).toBe(9100);
  });

  it("a run money day inside the period leaves Ops on its day", () => {
    const b = buildCashBoard(input({ moneyDays: [{ date: "2026-10-02", amount: 500, label: "Money day · August 2026" }] }))!;
    expect(b.columns[0].moneyDays).toEqual([{ date: "2026-10-02", amount: 500, label: "Money day · August 2026", counted: true }]);
    expect(b.columns[0].ending).toBeCloseTo(7309.08 + 4718.09 + 2404.76 - 1908 - 234.88 - 716.48 + 41 - 500, 2);
  });

  it("a future-dated balance is ignored; no balance at all → no board", () => {
    expect(buildCashBoard(input({ checks: [{ date: "2026-10-05", balance: 1, kind: "check", note: null }] }))).toBeNull();
    expect(buildCashBoard(input({ checks: [] }))).toBeNull();
  });
});

describe("buildCashBoard — an Ops number older than this Wednesday: what the previous period still owes rides in", () => {
  it("the Sep 25 Friday snapshot: last period's accrual (Fri Oct 2), its card leftover (Mon Sep 28), its bills on the 26th–29th come off — its own Friday is already inside", () => {
    const b = buildCashBoard(input({ checks: [SNAP925] }))!;
    const cur = b.columns[0];
    expect(b.base).toMatchObject({ date: "2026-09-25", kind: "snapshot" });
    expect(cur.since).toHaveLength(1);
    const p = cur.since[0];
    expect(p.week).toEqual(PREV);
    expect(p.payroll).toBeNull();
    expect(p.accrual).toMatchObject({ date: "2026-10-02", counted: true });
    expect(p.accrual!.amount).toBeCloseTo((605483 - 603232) * 0.32, 2);
    expect(p.leftover).toMatchObject({ amount: 1000.52, date: "2026-09-28", counted: true });
    expect(p.deposit).toBeNull(); // last period's deposit lands inside the current period — it's prevDeposit there
    expect(p.bills.map((x) => x.label)).toEqual(["Truck Note", "Guarantee fee", "Trailer Payment", "Phone"]);
    expect(p.total).toBeCloseTo(1000.52 - 720.32 - 3291.19, 2);
    expect(cur.prevDeposit).toMatchObject({ amount: 4718.09, counted: true });
    expect(cur.ending).toBeCloseTo(9927.54 + (1000.52 - 720.32 - 3291.19) + 4718.09 + 2404.76 - 1908 - 234.88 + 41 - 716.48, 2);
    expect(b.columns[1].since).toEqual([]);
  });

  it("the same day typed as an OPS NOW check still has that Friday's payroll ahead of it", () => {
    const b = buildCashBoard(input({ checks: [{ ...SNAP925, kind: "check" }] }))!;
    const p = b.columns[0].since[0];
    expect(p.payroll).toMatchObject({ amount: 1908, date: "2026-09-25", counted: true });
    expect(p.total).toBeCloseTo(1000.52 - 1908 - 720.32 - 3291.19, 2);
  });

  it("a number two periods back: the older period's own deposit landed after it, so it rides in too", () => {
    const b = buildCashBoard(input({ checks: [{ date: "2026-09-18", balance: 8000, kind: "check", note: null }] }))!;
    const since = b.columns[0].since;
    expect(since.map((p) => p.week)).toEqual([PREV, PREV2]);
    expect(since[1].deposit).toMatchObject({ date: "2026-09-24", counted: true, loads: 1 });
    expect(since[1].deposit!.amount).toBeCloseTo(3281.4 - 2000 - 172, 2);
    expect(since[1].payroll).toMatchObject({ date: "2026-09-18", counted: true });
  });
});
