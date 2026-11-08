import { describe, it, expect } from "vitest";
import { syntheticBook, TODAY, type Book } from "@/test/fixtures/book";
import { collectReadings, weekOdometerMiles } from "@/lib/metrics/odometer";
import { weeksOwed } from "@/lib/metrics/payWeeks";
import {
  getPlanStatus,
  getWaterfallStage,
  type AccrualInput,
  type MoneyDayInput,
  type PlanInput,
  type PlanStatus,
  type SnapshotInput,
} from "@/lib/metrics/planStatus";
import { missingWords } from "@/lib/integrity/require";

// PLAN-06 · a figure that needs an input the owner hasn't set REFUSES and says
// what is missing and where to set it (Jason, 2026-11-04 "a missing input
// never fails silently"; Nod Sheet "The Protection Stage", call 5). The Plan
// page reads the book the way StatusPage does: the latest snapshot's balances
// by account role, the plan's numbers, the owed pay week's odometer miles.

const latestSnapshot = (book: Book) => [...book.snapshots].sort((a, b) => (a.as_of < b.as_of ? 1 : -1))[0];

// SnapshotInput from the latest snapshot; `drop` removes one role's balance.
const snapInput = (book: Book, drop?: "ops" | "maintenance" | "vault" | "tax"): SnapshotInput => {
  const latest = latestSnapshot(book);
  const of = (role: string): number | null => {
    if (role === drop) return null;
    const acct = book.accounts.find((a) => a.role === role);
    const row = latest.balances.find((b) => b.account_id === acct?.account_id);
    return row ? Number(row.balance) : null;
  };
  return { as_of: latest.as_of, ops: of("ops"), vault: of("vault"), maintenance: of("maintenance"), tax: of("tax") };
};

const planInput = (book: Book, over: Partial<PlanInput> = {}): PlanInput => ({
  float_line: book.plan.float_line,
  maintenance_per_mile: book.plan.maintenance_per_mile,
  tax_pct: book.plan.tax_pct,
  maintenance_floor: book.plan.maintenance_floor,
  min_move: book.plan.min_move,
  objective_pct: book.plan.objective_pct,
  stages: book.plan.stages.map((s) => ({
    stage_id: s.stage_id, position: s.position, label: s.label, kind: s.kind, target_lo: s.target_lo, target_hi: s.target_hi,
  })),
  ...over,
});

// The pay week(s) the book still owes on TODAY and the odometer miles the chain
// holds for them — the pre-fill StatusPage hands the accrual.
const owedAccrual = (book: Book): AccrualInput => {
  const lastAccrued = book.snapshots.reduce<string | null>((m, s) => (s.pay_week_start && (!m || s.pay_week_start > m) ? s.pay_week_start : m), null);
  const { weeks } = weeksOwed(TODAY, lastAccrued);
  const readings = collectReadings(book.fuel, book.loads, book.trips);
  const perWeek = weeks.map((w) => weekOdometerMiles(readings, w).miles);
  const known = perWeek.every((m) => m != null);
  return {
    miles: known ? perWeek.reduce<number>((t, m) => t + (m as number), 0) : null,
    weekLabel: "owed",
    loads: 0, loadedMiles: 0, deadheadMiles: 0, noDeadhead: 0, source: "odometer",
  };
};

// October's money day: its P&L is filed and no snapshot has settled it.
const october = (book: Book): MoneyDayInput => {
  const p = book.periods.find((x) => x.period_month.slice(0, 10) === "2026-10-01");
  if (!p || p.income_total == null || p.cogs_total == null || p.expense_total == null) throw new Error("the book lost October's P&L");
  return { month: "2026-10-01", pretaxProfit: p.income_total - p.cogs_total - p.expense_total, income: p.income_total, cogs: p.cogs_total, expenses: p.expense_total };
};

const status = (book: Book, o: { drop?: "ops" | "maintenance" | "vault" | "tax"; plan?: Partial<PlanInput>; accrual?: AccrualInput; moneyDay?: boolean } = {}): PlanStatus =>
  getPlanStatus(snapInput(book, o.drop), planInput(book, o.plan), {
    accrual: o.accrual ?? owedAccrual(book),
    moneyDay: o.moneyDay === false ? null : october(book),
  })!;

describe("PLAN-06 · a money day with an unknown accrual refuses", () => {
  it("an owed pay week with no miles refuses the money day and names the miles, where to type them", () => {
    const book = syntheticBook();
    const st = status(book, { accrual: { ...owedAccrual(book), miles: null } });
    expect(st.moneyDay).toBeNull();
    expect(st.moneyDayRefused?.what).toBe("run the money day");
    expect(st.moneyDayRefused?.missing.map((m) => m.label)).toEqual(["the pay week's mileage"]);
    expect(st.moneyDayRefused?.missing[0].fixAt).toBe("FRIDAY SNAPSHOT");
    expect(missingWords(st.moneyDayRefused!.missing)).toBe("the pay week's mileage isn't set");
    expect(st.orders.join(" | ")).toContain("October's money day can't run — the pay week's mileage isn't set");
  });

  it("a book whose odometer chain has no reading for the owed week hands the accrual no miles — and the money day refuses", () => {
    const book = syntheticBook();
    const withChain = owedAccrual(book);
    expect(withChain.miles).not.toBeNull(); // the complete book reads the week off its chain
    // Strip every source of readings: the chain can't read the week, so it is unknown — never a 0-mile week.
    book.fuel = [];
    book.loads = [];
    book.trips = [];
    const gap = owedAccrual(book);
    expect(gap.miles).toBeNull();
    const st = status(book, { accrual: gap });
    expect(st.moneyDay).toBeNull();
    expect(st.moneyDayRefused?.missing.map((m) => m.key)).toContain("accrual_miles");
  });

  it("an unset $/mile on an owed accrual names the rate, in EDIT PLAN", () => {
    const book = syntheticBook();
    const st = status(book, { plan: { maintenance_per_mile: null } });
    expect(st.moneyDay).toBeNull();
    expect(st.moneyDayRefused?.missing.map((m) => m.label)).toEqual(["the maintenance $/mile"]);
    expect(st.moneyDayRefused?.missing[0].fixAt).toBe("EDIT PLAN");
  });

  it("a split percentage that isn't set is refused, not defaulted to 70", () => {
    const book = syntheticBook();
    const st = status(book, { plan: { objective_pct: null } });
    expect(st.moneyDay).toBeNull();
    expect(st.moneyDayRefused?.missing.map((m) => m.label)).toEqual(["the objective percent"]);
  });
});

describe("PLAN-06 · an unset maintenance floor refuses", () => {
  it("plan.maintenance_floor null refuses the money day and the interlock's floor — never a $0 floor that passes", () => {
    const book = syntheticBook();
    const st = status(book, { plan: { maintenance_floor: null } });
    expect(st.moneyDay).toBeNull();
    expect(st.moneyDayRefused?.what).toBe("run the money day");
    expect(st.moneyDayRefused?.missing.map((m) => m.label)).toEqual(["the Maintenance floor"]);
    expect(st.moneyDayRefused?.missing[0].fixAt).toBe("EDIT PLAN");
    const maint = st.interlock!.floors[1];
    expect(maint.floor).toBeNull();
    expect(maint.met).toBeNull();
    expect(maint.state).toBe("unknown");
    expect(maint.missing.map((m) => m.label)).toEqual(["the Maintenance floor"]);
  });

  it("the verdict waits on the floor when nothing else decides it", () => {
    const book = syntheticBook();
    const snap = { ...snapInput(book), ops: 20000, vault: 20000 };
    const st = getPlanStatus(snap, planInput(book, { maintenance_floor: null }), { accrual: null })!;
    expect(st.verdict).toBeNull();
    expect(st.waitingOn.map((m) => m.label)).toEqual(["the Maintenance floor"]);
  });

  it("a ladder rung with no target refuses the rung — it is not a $0 target", () => {
    const book = syntheticBook();
    const stages = planInput(book).stages.map((s) => (s.position === 1 ? { ...s, target_lo: null } : s));
    const w = getWaterfallStage(snapInput(book), stages)!;
    expect(w.refusedAt).toBe(0);
    expect(w.activeIndex).toBeNull();
    expect(w.stages[0].state).toBe("unknown");
    expect(w.stages[0].missing.map((m) => m.label)).toEqual(["rung 1's target"]);
    expect(w.stages[0].missing[0].fixAt).toBe("EDIT PLAN");
    // and the reserve floor, which is rung 1, refuses the money day with the same words
    const st = status(book, { plan: { stages } });
    expect(st.moneyDayRefused?.missing.map((m) => m.label)).toEqual(["rung 1's target"]);
  });
});

describe("PLAN-06 · an account with no balance typed reads unknown, not UNMET $0 of $X", () => {
  it("the latest snapshot without the Maintenance balance: the floor is unknown and the money day names the balance", () => {
    const book = syntheticBook();
    const st = status(book, { drop: "maintenance" });
    const maint = st.interlock!.floors[1];
    expect(maint.balance).toBeNull();
    expect(maint.met).toBeNull();
    expect(maint.short).toBeNull();
    expect(maint.state).toBe("unknown");
    expect(maint.missing.map((m) => m.label)).toEqual(["the Maintenance balance"]);
    expect(st.moneyDay).toBeNull();
    expect(st.moneyDayRefused?.missing.map((m) => m.label)).toEqual(["the Maintenance balance"]);
    expect(st.moneyDayRefused?.missing[0].fixAt).toBe("FRIDAY SNAPSHOT");
    // never the entry's "UNMET ($0 of $X)" — there is no entry at all
    expect(st.moneyDay?.entry.join("\n") ?? "").not.toMatch(/UNMET \(\$0/);
  });

  it("the Vault balance missing: the verdict waits for it — 'the Vault balance isn't set'", () => {
    const book = syntheticBook();
    // Ops and Maintenance both hold, so the Vault balance is the one thing the verdict lacks.
    const snap = { ...snapInput(book, "vault"), ops: 20000, maintenance: 6000 };
    const st = getPlanStatus(snap, planInput(book), { accrual: null })!;
    expect(st.verdict).toBeNull();
    expect(st.waitingOn.map((m) => m.label)).toEqual(["the Vault balance"]);
    expect(missingWords(st.waitingOn)).toBe("the Vault balance isn't set");
    expect(st.interlock!.floors[2].state).toBe("unknown");
    expect(st.interlock!.floors[2].short).toBeNull();
  });

  it("the Ops balance missing: nothing is judged, the verdict waits for it", () => {
    const book = syntheticBook();
    const st = status(book, { drop: "ops", moneyDay: false });
    expect(st.verdict).toBeNull();
    expect(st.opsAfter).toBeNull();
    expect(st.waitingOn.map((m) => m.label)).toEqual(["the Ops balance"]);
  });
});

describe("PLAN-06 · the complete book computes a status with no refusals", () => {
  it("every input set: a verdict, a money day, no refusal, nothing waited on", () => {
    const book = syntheticBook();
    const st = status(book);
    expect(st.moneyDayRefused).toBeNull();
    expect(st.waitingOn).toEqual([]);
    expect(st.moneyDay).not.toBeNull();
    expect(st.verdict).not.toBeNull();
    expect(st.interlock!.waitingOn).toEqual([]);
    expect(st.interlock!.floors.every((f) => f.met !== null && f.short !== null)).toBe(true);
    expect(st.waterfall!.missing).toEqual([]);
    // derived: the three floors are the plan's own numbers — float $10,000, maintenance $5,000, vault rung 1 $15,000 (fixtures book plan)
    expect(st.interlock!.floors.map((f) => f.floor)).toEqual([10000, 5000, 15000]);
  });
});
