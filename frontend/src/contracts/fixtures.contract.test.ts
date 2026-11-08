import { describe, it, expect } from "vitest";
import { syntheticBook, brokenPeriod, TODAY, type Book } from "@/test/fixtures/book";
import { computeRateTargets, monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { buildCashBoard, runningWeekPace, runningMilesPace, type CashCheck, type CashBoardInput } from "@/lib/metrics/cashBoard";
import { collectReadings } from "@/lib/metrics/odometer";
import { deductionBuckets } from "@/lib/metrics/settlements";

const dow = (k: string): number => new Date(`${k}T00:00:00Z`).getUTCDay();
const WEDNESDAY = 3;
const now = new Date(`${TODAY}T00:00:00Z`);

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

describe("fixtures · the synthetic book", () => {
  describe("hygiene", () => {
    it("carries no email, phone number or real-looking load number", () => {
      const text = JSON.stringify(syntheticBook());
      expect(text).not.toMatch(/@|\(\d{3}\)|\d{3}-\d{3}-\d{4}/);
      const numbers = syntheticBook().loads.map((l) => Number(l.load_number));
      expect(numbers.every((n) => n >= 9100001)).toBe(true);
      // Every 7-digit load number mentioned anywhere (settlement lines, ids) is one of ours.
      const ours = new Set(syntheticBook().loads.map((l) => l.load_number));
      const mentioned = text.match(/\b\d{7}\b/g) ?? [];
      for (const m of mentioned) if (Number(m) < 9100001 || Number(m) > 9199999) expect(ours.has(m)).toBe(true);
    });

    it("hands out a fresh object graph on every call", () => {
      const a = syntheticBook();
      a.loads[0].load_status = "cancelled";
      a.periods[0].lines?.push({ line_id: "x", category: "x", amount: 1, type: "fixed", section: "cogs" });
      const b = syntheticBook();
      expect(b.loads[0].load_status).toBe("delivered");
      expect(b.periods[0].lines?.some((l) => l.line_id === "x")).toBe(false);
      expect(JSON.stringify(syntheticBook())).toBe(JSON.stringify(syntheticBook()));
    });
  });

  describe("invariants", () => {
    it("TODAY is a Wednesday", () => {
      expect(dow(TODAY)).toBe(WEDNESDAY);
    });

    it("every statement ends on a Wednesday", () => {
      const { settlements } = syntheticBook();
      expect(settlements.length).toBeGreaterThan(20);
      for (const s of settlements) expect(dow(s.period_ending)).toBe(WEDNESDAY);
      expect(settlements.filter((s) => Number(s.net) < 0)).toHaveLength(1);
    });

    it("six months are filed, May–Oct 2026, each consistent with its own lines", () => {
      const { periods } = syntheticBook();
      expect(periods.map((p) => p.period_month)).toEqual([
        "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01",
      ]);
      for (const p of periods) {
        const sum = (section: string) =>
          Math.round((p.lines ?? []).filter((l) => l.section === section).reduce((s, l) => s + l.amount, 0) * 100) / 100;
        expect(p.cogs_total).toBe(sum("cogs"));
        expect(p.expense_total).toBe(sum("expenses"));
        expect(p.income_total).not.toBeNull();
      }
    });

    it("the odometer chain holds: each start copies the previous end, except one fresh reading", () => {
      const delivered = syntheticBook()
        .loads.filter((l) => l.load_status === "delivered")
        .sort((a, b) => a.pickup_date.localeCompare(b.pickup_date));
      expect(delivered.length).toBeGreaterThanOrEqual(30);
      expect(delivered[0].odometer_start).toBe(500000);
      const breaks: number[] = [];
      for (let i = 1; i < delivered.length; i++) {
        const start = Number(delivered[i].odometer_start);
        const prevEnd = Number(delivered[i - 1].odometer_end);
        if (start !== prevEnd) {
          expect(start).toBeGreaterThan(prevEnd);
          breaks.push(i);
        }
      }
      expect(breaks).toHaveLength(1);
      // …and the one fresh reading is the logged home trip's own end.
      const { trips } = syntheticBook();
      expect(trips).toHaveLength(1);
      expect(trips[0].trip_purpose).toBe("home");
      expect(trips[0].odometer_start).toBe(delivered[breaks[0] - 1].odometer_end);
      expect(trips[0].odometer_end).toBe(delivered[breaks[0]].odometer_start);
    });

    it("loaded miles never exceed the odometer span", () => {
      for (const l of syntheticBook().loads) {
        if (l.odometer_start == null || l.odometer_end == null) continue;
        expect(l.loaded_miles).toBeLessThanOrEqual(l.odometer_end - l.odometer_start);
      }
    });

    it("has the status mix the contracts lean on", () => {
      const byStatus: Record<string, number> = {};
      for (const l of syntheticBook().loads) byStatus[l.load_status] = (byStatus[l.load_status] ?? 0) + 1;
      expect(byStatus.delivered).toBeGreaterThanOrEqual(30);
      expect(byStatus.booked).toBe(1);
      expect(byStatus.in_transit).toBe(1);
      expect(byStatus.tonu).toBe(1);
      expect(byStatus.cancelled).toBe(1);
      for (const l of syntheticBook().loads.filter((x) => x.load_status === "booked" || x.load_status === "in_transit"))
        expect(String(l.delivery_date) < TODAY).toBe(true);
    });

    it("net and gross are filled the way the backend fills them", () => {
      for (const l of syntheticBook().loads) {
        const gross = Number(l.linehaul) + Number(l.fuel_surcharge) + Number(l.total_accessorials);
        expect(Number(l.gross_revenue)).toBeCloseTo(gross, 2);
        expect(Number(l.net_revenue)).toBeLessThanOrEqual(gross + 0.005);
      }
    });
  });

  describe("smoke", () => {
    it("the ladder is ready on a six-month basis", () => {
      const book = syntheticBook();
      const t = computeRateTargets(book.loads, book.periods, monthlyObligationCost(book.obligations), book.schedule, now);
      expect(t.ready).toBe(true);
      expect(t.basis.months).toBe(6);
      expect(t.basis.missingLabel).toBeNull();
    });

    it("an unfiled month drops out of the basis and is named", () => {
      const book = syntheticBook();
      const periods = [...book.periods.slice(0, 5), brokenPeriod(book.periods[5])];
      const t = computeRateTargets(book.loads, periods, monthlyObligationCost(book.obligations), book.schedule, now);
      expect(t.basis.months).toBe(5);
      expect(t.basis.missingLabel).toContain("Oct");
    });

    it("the cash board returns its two period columns", () => {
      const board = buildCashBoard(cashInput(syntheticBook()));
      expect(board).not.toBeNull();
      expect(board?.columns).toHaveLength(2);
      expect(board?.columns.map((c) => c.key)).toEqual(["current", "next"]);
    });
  });
});
