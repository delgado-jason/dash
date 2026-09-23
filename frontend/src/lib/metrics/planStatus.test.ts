import { describe, it, expect } from "vitest";
import {
  getAccrual,
  getTaxMove,
  getSurplus,
  getCushionProgress,
  getWaterfallStage,
  getInterlock,
  getMoneyDay,
  getPlanStatus,
  objectiveIndexOf,
  money,
  monthName,
  type PlanStageInput,
  type SnapshotInput,
  type PlanInput,
} from "./planStatus";

const snap = (over: Partial<SnapshotInput>): SnapshotInput => ({
  ops: 0, vault: 0, maintenance: 0, tax: 0, ...over,
});

// THE 2027 PLAN as it stands in prod (2026-09-22) — numeric strings like
// Postgres sends them. Rung 1 is floor 3 of the interlock.
const stages = (): PlanStageInput[] => [
  { position: 1, label: "Vault cushion — the floor", kind: "vault", target_lo: "15000" },
  { position: 2, label: "Best Egg — kill the 22% note", kind: "obligation", target_lo: "0",
    obligation: { current_balance: 11086.56, original_balance: 13000 } },
  { position: 3, label: "Trade-up fund", kind: "trailer", target_lo: "15000", target_hi: "18000" },
  { position: 4, label: "Cushion — three months of the burn", kind: "vault", target_lo: "30000", target_hi: "35000" },
];

const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  float_line: "10000", stages: stages(),
  maintenance_per_mile: "0.32", tax_pct: "20", maintenance_floor: "5000", min_move: "500", objective_pct: "70",
  ...over,
});

// The Sep 18 snapshot, and this pay week's 1,999 miles.
const sep18 = () => snap({ ops: "8575", vault: "0", maintenance: "1161", tax: "9590" });
const thisWeek = { miles: 1999, weekLabel: "Sep 16–22", loads: 2, loadedMiles: 1669, deadheadMiles: 330, noDeadhead: 0 };
const august = { month: "2026-08-01", pretaxProfit: -1431.06 };
const july = { month: "2026-07-01", pretaxProfit: 14483.87 };

describe("money / monthName", () => {
  it("formats whole dollars with a real minus sign", () => {
    expect(money(1999 * 0.32)).toBe("$640");
    expect(money(-1431.06)).toBe("−$1,431");
    expect(money(0)).toBe("$0");
  });
  it("names the month without a timezone slip", () => {
    expect(monthName("2026-08-01")).toBe("August 2026");
    expect(monthName("2026-12-01T06:00:00.000Z")).toBe("December 2026");
  });
});

describe("getAccrual — the Friday move", () => {
  it("is null on missing data — never a fake zero", () => {
    expect(getAccrual(null, 0.32)).toBeNull();
    expect(getAccrual("1999", null)).toBeNull();
    expect(getAccrual("", "0.32")).toBeNull();
  });
  it("1,999 miles at 32¢ is $639.68", () => {
    expect(getAccrual("1999", "0.32")).toBeCloseTo(639.68, 2);
    expect(getAccrual(0, 0.32)).toBe(0);
  });
});

describe("getTaxMove — off the top", () => {
  it("20 % of July's $14,484 is $2,897; a loss month moves $0", () => {
    expect(getTaxMove(14483.87, "20")).toBeCloseTo(2896.77, 2);
    expect(getTaxMove(-1431.06, 20)).toBe(0);
    expect(getTaxMove(null, 20)).toBeNull();
    expect(getTaxMove(1000, null)).toBeNull();
  });
});

describe("getSurplus — what's above the float after the moves", () => {
  it("is null on missing data; 0 at or under the line", () => {
    expect(getSurplus(null, 10000)).toBeNull();
    expect(getSurplus("12300", "10000")).toBe(2300);
    expect(getSurplus(10000, 10000)).toBe(0);
    expect(getSurplus(7935, 10000)).toBe(0);
  });
});

describe("getInterlock — three floors in Jason's order", () => {
  it("Ops under the float holds everything; the other floors report their shortfalls", () => {
    const il = getInterlock({ opsAfter: 7935.32, maintenanceAfter: 1800.68, vault: 0 }, { ops: 10000, maintenance: 5000, vault: 15000 }, 0);
    expect(il.heldBy).toBe("ops");
    expect(il.floors.map((f) => f.state)).toEqual(["held", "next", "next"]);
    expect(il.floors[0].short).toBeCloseTo(2064.68, 2);
    expect(il.floors[1].short).toBeCloseTo(3199.32, 2);
    expect(il.floors[2].short).toBe(15000);
    expect(il.remainder).toBe(0);
  });
  it("fills Maintenance first, then the Vault, and only what each is short", () => {
    const il = getInterlock({ opsAfter: 16758, maintenanceAfter: 1801, vault: 0 }, { ops: 10000, maintenance: 5000, vault: 15000 }, 6758);
    expect(il.floors[1].fill).toBe(3199);
    expect(il.floors[1].met).toBe(true);
    expect(il.floors[2].fill).toBe(3559);
    expect(il.floors[2].short).toBe(11441);
    expect(il.heldBy).toBe("vault");
    expect(il.floors.map((f) => f.state)).toEqual(["met", "met", "held"]);
    expect(il.remainder).toBe(0);
  });
  it("issue 10 · floors met mid-day: the rest is the remainder to split", () => {
    const il = getInterlock({ opsAfter: 16758, maintenanceAfter: 1801, vault: 15000 }, { ops: 10000, maintenance: 5000, vault: 15000 }, 6758);
    expect(il.floors[1].fill).toBe(3199);
    expect(il.floors[2].fill).toBe(0);
    expect(il.heldBy).toBeNull();
    expect(il.remainder).toBe(3559);
  });
  it("a missing maintenance balance is treated as an empty floor, not a met one", () => {
    const il = getInterlock({ opsAfter: 12000, maintenanceAfter: null, vault: 20000 }, { ops: 10000, maintenance: 5000, vault: 15000 }, 0);
    expect(il.floors[1].met).toBe(false);
    expect(il.heldBy).toBe("maintenance");
  });
});

describe("getMoneyDay — the SOP's sequence on real numbers", () => {
  it("August on the Sep 18 balances: tax $0, held by the operating floor, the six-line interlock entry", () => {
    const md = getMoneyDay(sep18(), plan(), august, 639.68, "Best Egg — kill the 22% note")!;
    expect(md.tax).toBe(0);
    expect(md.opsAfter).toBeCloseTo(7935.32, 2);
    expect(md.surplus).toBe(0);
    expect(md.belowMin).toBe(false);
    expect(md.interlock.heldBy).toBe("ops");
    expect(md.objective).toBe(0);
    expect(md.household).toBe(0);
    expect(md.entry).toEqual([
      "MONTH ........... August 2026",
      "Pre-tax profit .. −$1,431",
      "Tax swept ....... $0   (20 % per plan — a loss month)",
      "Floors .......... HELD — operating, short $2,065   (maintenance short $3,199 · reserve short $15,000)",
      "Surplus ......... $0   (Ops $7,935 after the accrual − $0 tax − $10,000 floor)",
      "Distribution .... $0 — interlock",
    ]);
  });

  it("July's books on the Aug 18 balances: $2,897 tax, $6,758 surplus, all to the Vault floor", () => {
    const aug18 = snap({ ops: "20294.92", vault: "0", maintenance: "4773.01", tax: "545.04" });
    const md = getMoneyDay(aug18, plan(), july, 639.68, "Best Egg — kill the 22% note")!;
    expect(md.tax).toBeCloseTo(2896.77, 2);
    expect(md.opsAfter).toBeCloseTo(16758.47, 2);
    expect(md.surplus).toBeCloseTo(6758.47, 2);
    const [ops, maint, vault] = md.interlock.floors;
    expect(ops.met).toBe(true);
    expect(maint.met).toBe(true); // 4,773 + 640 = 5,413 ≥ 5,000
    expect(maint.fill).toBe(0);
    expect(vault.fill).toBeCloseTo(6758.47, 2);
    expect(md.interlock.heldBy).toBe("vault");
    expect(md.objective).toBe(0);
    expect(md.entry[3]).toBe("Floors .......... HELD — reserve, short $8,242   (operating met · maintenance met)");
    expect(md.entry[4]).toBe("Surplus ......... $6,758   → directed to the Vault $6,758 (now $6,758 of $15,000)");
    expect(md.entry[5]).toBe("Objective ....... $0   → Best Egg — kill the 22% note — interlock");
    expect(md.entry[6]).toBe("Distribution .... $0 — interlock");
  });

  it("once the Vault holds $15,000 the same $6,758 splits $4,731 / $2,027 — the seven-line standard entry", () => {
    const s = snap({ ops: "20294.92", vault: "15000", maintenance: "4773.01" });
    const md = getMoneyDay(s, plan(), july, 639.68, "Best Egg — kill the 22% note")!;
    expect(md.interlock.heldBy).toBeNull();
    expect(md.objective).toBeCloseTo(4730.93, 1);
    expect(md.household).toBeCloseTo(2027.54, 1);
    expect(md.entry.length).toBe(7);
    expect(md.entry[3]).toBe("Floors .......... operating met · maintenance met · reserve met");
    expect(md.entry[5]).toBe("Objective ....... $4,731   → Best Egg — kill the 22% note");
    expect(md.entry[6]).toBe("Distribution .... $2,028   → household");
  });

  it("issue 10 · a fill that completes the floors splits the rest the same day, and the entry says so", () => {
    const s = snap({ ops: "17398", vault: "15000", maintenance: "1161" }); // 17,398 − 640 = 16,758 after the accrual; 1,161 + 640 = 1,801
    const md = getMoneyDay(s, plan(), { month: "2026-09-01", pretaxProfit: 0 }, 640, "Best Egg — kill the 22% note")!;
    expect(md.surplus).toBe(6758);
    expect(md.interlock.floors[1].fill).toBe(3199);
    expect(md.interlock.remainder).toBe(3559);
    expect(md.objective).toBeCloseTo(2491.3, 1);
    expect(md.household).toBeCloseTo(1067.7, 1);
    expect(md.entry[3]).toBe("Floors .......... maintenance filled $3,199 today · all met");
  });

  it("issue 12 · a $499 surplus is under the minimum: nothing moves, next month's balance still has it", () => {
    const s = snap({ ops: "10499", vault: "15000", maintenance: "6000" });
    const md = getMoneyDay(s, plan(), { month: "2026-09-01", pretaxProfit: 0 }, 0, "Best Egg — kill the 22% note")!;
    expect(md.surplus).toBe(499);
    expect(md.belowMin).toBe(true);
    expect(md.interlock.floors.every((f) => f.fill === 0)).toBe(true);
    expect(md.objective).toBe(0);
    expect(md.entry[4]).toBe("Surplus ......... $499   — under the $500 minimum, nothing moves");
    expect(md.entry[6]).toBe("Distribution .... $0 — under the minimum");
  });

  it("exactly the minimum moves", () => {
    const s = snap({ ops: "10500", vault: "15000", maintenance: "6000" });
    const md = getMoneyDay(s, plan(), { month: "2026-09-01", pretaxProfit: 0 }, 0, null)!;
    expect(md.belowMin).toBe(false);
    expect(md.objective).toBe(350);
    expect(md.household).toBe(150);
    expect(md.entry[5]).toBe("Objective ....... $350   → the current objective");
  });

  it("is null without the month's profit — a money day can't run on an open month", () => {
    expect(getMoneyDay(sep18(), plan(), { month: "2026-09-01", pretaxProfit: null }, 0, null)).toBeNull();
    expect(getMoneyDay(sep18(), plan(), null, 0, null)).toBeNull();
  });
});

describe("getCushionProgress", () => {
  it("is null with no vault or no floor", () => {
    expect(getCushionProgress(null, 15000, 30000)).toBeNull();
    expect(getCushionProgress(8750, null, 30000)).toBeNull();
  });
  it("measures to-floor and to-goal from numeric strings", () => {
    const c = getCushionProgress("8750", "15000", "30000")!;
    expect(c.toFloor).toBe(6250);
    expect(c.toGoal).toBe(21250);
    expect(c.pctFloor).toBeCloseTo(8750 / 15000, 5);
  });
});

describe("getWaterfallStage — the cascade still grades the ladder", () => {
  it("is null with no snapshot, no stages, or no vault number", () => {
    expect(getWaterfallStage(null, stages())).toBeNull();
    expect(getWaterfallStage(snap({}), [])).toBeNull();
    expect(getWaterfallStage(snap({ vault: null }), stages())).toBeNull();
  });
  it("vault 16,200 → floor holds, Best Egg active with $1,200 above the ratchet", () => {
    const w = getWaterfallStage(snap({ vault: 16200 }), stages())!;
    expect(w.stages[0].state).toBe("done");
    expect(w.protectedLevel).toBe(15000);
    expect(w.activeIndex).toBe(1);
    expect(w.stages[1].overflow).toBe(1200);
    expect(w.stages[1].progress).toBeCloseTo((13000 - 11086.56) / 13000, 5);
  });
  it("dead Best Egg hands off to the trade-up fund, measured above the ratchet", () => {
    const st = stages();
    st[1].obligation = { current_balance: 0, original_balance: 13000 };
    const w = getWaterfallStage(snap({ vault: 19500 }), st)!;
    expect(w.activeIndex).toBe(2);
    expect(w.stages[2].currentValue).toBe(4500);
    expect(w.stages[2].overflow).toBe(4500);
  });
  it("every stage done → activeIndex null", () => {
    const st = stages();
    st[1].obligation = { current_balance: 0, original_balance: 13000 };
    expect(getWaterfallStage(snap({ vault: 36000 }), st)!.activeIndex).toBeNull();
  });
});

describe("objectiveIndexOf — the current objective skips floor 3", () => {
  it("with the vault empty, rung 1 is the active stage but Best Egg is the objective", () => {
    const w = getWaterfallStage(snap({ vault: 0 }), stages())!;
    expect(w.activeIndex).toBe(0);
    expect(objectiveIndexOf(w, stages())).toBe(1);
  });
  it("with the floor held, active and objective agree", () => {
    const w = getWaterfallStage(snap({ vault: 16200 }), stages())!;
    expect(objectiveIndexOf(w, stages())).toBe(1);
  });
  it("a finished ladder has no objective", () => {
    const st = stages();
    st[1].obligation = { current_balance: 0, original_balance: 13000 };
    expect(objectiveIndexOf(getWaterfallStage(snap({ vault: 36000 }), st), st)).toBeNull();
  });
});

describe("getPlanStatus — the whole verdict", () => {
  it("is null without a snapshot or plan", () => {
    expect(getPlanStatus(null, plan())).toBeNull();
    expect(getPlanStatus(snap({}), null)).toBeNull();
  });

  it("this Friday on the Sep 18 balances: accrue $640, below the float — hold", () => {
    const st = getPlanStatus(sep18(), plan(), { accrual: thisWeek })!;
    expect(st.accrual).toBeCloseTo(639.68, 2);
    expect(st.opsAfter).toBeCloseTo(7935.32, 2);
    expect(st.verdict).toBe("below-float");
    expect(st.orders).toEqual(["Accrue Maintenance $640 (1,999 mi × $0.32)", "Below the float — hold"]);
    expect(st.interlock!.heldBy).toBe("ops");
    expect(st.interlock!.floors.every((f) => f.fill === 0)).toBe(true);
    expect(st.objectiveIndex).toBe(1);
    expect(st.moneyDay).toBeNull();
  });

  it("August's money day ticked on the same form: tax, then held by the operating floor", () => {
    const st = getPlanStatus(sep18(), plan(), { accrual: thisWeek, moneyDay: august })!;
    expect(st.moneyDay!.tax).toBe(0);
    expect(st.orders).toEqual([
      "Accrue Maintenance $640 (1,999 mi × $0.32)",
      "Tax $0 (August 2026: a loss)",
      "Surplus $0 — held by the operating floor, short $2,065",
    ]);
  });

  it("a paying month reads as two orders after the floors", () => {
    const s = snap({ ops: "20294.92", vault: "15000", maintenance: "4773.01" });
    const st = getPlanStatus(s, plan(), { accrual: thisWeek, moneyDay: july })!;
    expect(st.orders).toEqual([
      "Accrue Maintenance $640 (1,999 mi × $0.32)",
      "Tax $2,897 (July 2026: 20 % of $14,484)",
      "Best Egg — kill the 22% note $4,731 · Household $2,028",
    ]);
  });

  it("a fill shows as its own order before the split", () => {
    const s = snap({ ops: "17398", vault: "15000", maintenance: "1161" });
    const st = getPlanStatus(s, plan(), { accrual: { ...thisWeek, miles: 2000 }, moneyDay: { month: "2026-09-01", pretaxProfit: 0 } })!;
    expect(st.orders[2]).toBe("Maintenance $3,199 (floor 2)");
    expect(st.orders[3]).toBe("Best Egg — kill the 22% note $2,491 · Household $1,068");
  });

  it("verdicts: FLOORS FIRST when Ops holds but a reserve is under its floor; ON PLAN when all hold", () => {
    expect(getPlanStatus(snap({ ops: 12000, vault: 0, maintenance: 1000 }), plan())!.verdict).toBe("floors-first");
    expect(getPlanStatus(snap({ ops: 12000, vault: 16000, maintenance: 6000 }), plan())!.verdict).toBe("on-plan");
    expect(getPlanStatus(snap({ ops: 9999, vault: 16000, maintenance: 6000 }), plan())!.verdict).toBe("below-float");
  });

  it("the accrual counts toward the verdict: $10,300 on the snapshot is under the float after a $640 move", () => {
    const st = getPlanStatus(snap({ ops: 10300, vault: 16000, maintenance: 6000 }), plan(), { accrual: thisWeek })!;
    expect(st.verdict).toBe("below-float");
  });

  it("issue 6 · a load with no deadhead is flagged, and the miles still accrue", () => {
    const st = getPlanStatus(sep18(), plan(), { accrual: { ...thisWeek, miles: 938, loads: 1, noDeadhead: 1 } })!;
    expect(st.accrualFlag).toBe("1 of 1 load has no deadhead logged — fix the load or edit the miles");
    expect(st.accrual).toBeCloseTo(300.16, 2);
    const st2 = getPlanStatus(sep18(), plan(), { accrual: { ...thisWeek, noDeadhead: 1 } })!;
    expect(st2.accrualFlag).toBe("1 of 2 loads have no deadhead logged — fix the load or edit the miles");
  });

  it("issue 11 · vault money above the ratchet still goes whole to the objective", () => {
    const st = getPlanStatus(snap({ ops: 12000, vault: 16200, maintenance: 6000 }), plan())!;
    expect(st.verdict).toBe("on-plan");
    expect(st.orders).toEqual(["$1,200 above the ratchet — send it to Best Egg — kill the 22% note"]);
  });

  it("no miles given → no accrual and no accrual order; a blank miles field is not zero", () => {
    const st = getPlanStatus(sep18(), plan(), { accrual: { ...thisWeek, miles: "" } })!;
    expect(st.accrual).toBeNull();
    expect(st.orders).toEqual(["Below the float — hold"]);
  });
});
