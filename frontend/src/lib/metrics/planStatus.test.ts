import { describe, it, expect } from "vitest";
import {
  getSweep,
  getCushionProgress,
  getWaterfallStage,
  getPlanStatus,
  type PlanStageInput,
  type SnapshotInput,
} from "./planStatus";

const snap = (over: Partial<SnapshotInput>): SnapshotInput => ({
  ops: 0, vault: 0, maintenance: 0, tax: 0, trailer: 0, ...over,
});

// THE 2027 PLAN, as seeded — numeric strings like Postgres sends them.
const stages = (): PlanStageInput[] => [
  { position: 1, label: "IRS — clear it", kind: "obligation", target_lo: "0",
    obligation: { current_balance: 0, original_balance: 4000 } },
  { position: 2, label: "Vault cushion — the floor", kind: "vault", target_lo: "15000" },
  { position: 3, label: "Best Egg — kill the 22% note", kind: "obligation", target_lo: "0",
    obligation: { current_balance: 11086.56, original_balance: 13000 } },
  { position: 4, label: "Trade-up fund", kind: "trailer", target_lo: "15000", target_hi: "18000" },
  { position: 5, label: "Cushion — three months of the burn", kind: "vault", target_lo: "30000", target_hi: "35000" },
];

describe("getSweep — the Friday order", () => {
  it("is null on missing data — never a fake zero", () => {
    expect(getSweep(null, 10000)).toBeNull();
    expect(getSweep(12300, null)).toBeNull();
  });
  it("sweeps everything over the float line; 0 at or under (hold)", () => {
    expect(getSweep("12300", "10000")).toBe(2300);
    expect(getSweep(10000, 10000)).toBe(0);
    expect(getSweep(8500, 10000)).toBe(0);
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
  it("clamps past the floor", () => {
    const c = getCushionProgress(16200, 15000, 30000)!;
    expect(c.toFloor).toBe(0);
    expect(c.pctFloor).toBe(1);
  });
});

describe("getWaterfallStage — the cascade", () => {
  it("is null with no snapshot, no stages, or no vault number", () => {
    expect(getWaterfallStage(null, stages())).toBeNull();
    expect(getWaterfallStage(snap({}), [])).toBeNull();
    expect(getWaterfallStage(snap({ vault: null }), stages())).toBeNull();
  });

  it("building the floor: stage 2 active, no overflow anywhere", () => {
    const w = getWaterfallStage(snap({ vault: 8750 }), stages())!;
    expect(w.stages[0].state).toBe("done"); // IRS at $0
    expect(w.activeIndex).toBe(1);
    expect(w.stages[1].state).toBe("active");
    expect(w.stages[1].progress).toBeCloseTo(8750 / 15000, 5);
    expect(w.stages[1].overflow).toBeNull(); // vault stages never carry overflow
    expect(w.protectedLevel).toBe(0);
  });

  it("Jason's cascade case: vault 16,200 → floor holds, Best Egg active, $1,200 overflow", () => {
    const w = getWaterfallStage(snap({ vault: 16200 }), stages())!;
    expect(w.stages[1].state).toBe("done");
    expect(w.protectedLevel).toBe(15000);
    expect(w.activeIndex).toBe(2);
    const egg = w.stages[2];
    expect(egg.state).toBe("active");
    expect(egg.overflow).toBe(1200); // vault − ratchet: the money that hunts Best Egg
    expect(egg.progress).toBeCloseTo((13000 - 11086.56) / 13000, 5); // paid-down share
  });

  it("an unbound obligation stage can't be graded — it holds the line as active with ghost progress", () => {
    const st = stages();
    st[0].obligation = null; // IRS not bound yet
    const w = getWaterfallStage(snap({ vault: 16200 }), st)!;
    expect(w.activeIndex).toBe(0);
    expect(w.stages[0].progress).toBe(0);
    expect(w.stages[0].currentValue).toBeNull();
  });

  it("dead Best Egg hands off to the trade-up fund — VAULT OVERFLOW, not the holding account", () => {
    const st = stages();
    st[2].obligation = { current_balance: 0, original_balance: 13000 };
    // The snapshot's trailer column is his HOLDING account (note + guarantor,
    // zeroes monthly) — it must not move any stage.
    const w = getWaterfallStage(snap({ vault: 19500, trailer: 830 }), st)!;
    expect(w.activeIndex).toBe(3);
    const fund = w.stages[3];
    expect(fund.state).toBe("active");
    expect(fund.currentValue).toBe(4500); // 19,500 − 15,000 ratchet: money above the cushion
    expect(fund.progress).toBeCloseTo(4500 / 15000, 5);
    expect(fund.overflow).toBe(4500);
  });

  it("the holding account never drives the waterfall", () => {
    const st = stages();
    st[2].obligation = { current_balance: 0, original_balance: 13000 };
    const a = getWaterfallStage(snap({ vault: 19500, trailer: 0 }), st)!;
    const b = getWaterfallStage(snap({ vault: 19500, trailer: 99999 }), st)!;
    expect(a.activeIndex).toBe(b.activeIndex);
    expect(a.stages[3].progress).toBeCloseTo(b.stages[3].progress, 10);
  });

  it("the trade-up fund completes on overflow ≥ target — above the ratchet, not absolute vault", () => {
    const st = stages();
    st[2].obligation = { current_balance: 0, original_balance: 13000 };
    // Vault 30k: 15k protected + 15k above → stage 4 done, stage 5 (30k absolute) done too? 30k ≥ 30k → the finish only if plan says so.
    const w = getWaterfallStage(snap({ vault: 30500 }), st)!;
    expect(w.stages[3].state).toBe("done"); // 15,500 above the 15k ratchet
  });

  it("the final vault stage runs to the goal with no overflow concept", () => {
    const st = stages();
    st[2].obligation = { current_balance: 0, original_balance: 13000 };
    // Vault 31k: floor done, trade-up done (16k above 15k ratchet), final
    // cushion stage active toward 30k... 31k ≥ 30k → all done.
    const w = getWaterfallStage(snap({ vault: 31000 }), st)!;
    expect(w.activeIndex).toBeNull();
    // Vault 27k: trade-up still filling (12k of 15k above the ratchet).
    const w2 = getWaterfallStage(snap({ vault: 27000 }), st)!;
    expect(w2.activeIndex).toBe(3);
    expect(w2.stages[3].progress).toBeCloseTo(12000 / 15000, 5);
  });

  it("every stage done → activeIndex null (the finish line)", () => {
    const st = stages();
    st[2].obligation = { current_balance: 0, original_balance: 13000 };
    const w = getWaterfallStage(snap({ vault: 36000 }), st)!;
    expect(w.activeIndex).toBeNull();
    expect(w.stages.every((x) => x.state === "done")).toBe(true);
  });
});

describe("getPlanStatus — the whole verdict", () => {
  const plan = () => ({ float_line: "10000" as string | number, stages: stages() });

  it("is null without a snapshot or plan", () => {
    expect(getPlanStatus(null, plan())).toBeNull();
    expect(getPlanStatus(snap({}), null)).toBeNull();
  });

  it("orders read like Friday: sweep + send-the-overflow", () => {
    const st = getPlanStatus(snap({ ops: 12300, vault: 16200 }), plan())!;
    expect(st.verdict).toBe("on-plan");
    expect(st.sweep).toBe(2300);
    expect(st.orders[0]).toContain("Sweep $2,300");
    expect(st.orders[1]).toContain("$1,200");
    expect(st.orders[1]).toContain("Best Egg");
  });

  it("below the float says hold", () => {
    const st = getPlanStatus(snap({ ops: 8200, vault: 9000 }), plan())!;
    expect(st.verdict).toBe("below-float");
    expect(st.orders[0]).toBe("Below the float — hold");
  });
});
