// The 2027 Plan's brain — pure, plan-as-input, so 2028 is data, not a code
// change. All money arrives as Postgres numeric strings; coerce here, once.
//
// THE CASCADE (Jason, 2026-08-16): the vault is one account carved by
// ratcheting thresholds. Each vault-kind stage sets the PROTECTED level; money
// above the highest completed vault threshold is the OVERFLOW, and the
// overflow funds the current non-vault stage ("anything above the floor
// starts contributing to Best Egg"). Obligation stages complete at $0 balance.
// 'trailer'-kind stages are OVERFLOW FUNDS (the trade-up war chest): they
// measure vault money ABOVE the ratchet — NOT the snapshot's trailer column,
// which is his trailer HOLDING account (note + guarantor out, zeroes monthly,
// 55% of trailer revenue committed to the vault) and drives no stage.
//
// The Friday ritual is snapshot-FIRST: raw balances in, orders out.

export interface PlanStageInput {
  stage_id?: string;
  position: number;
  label: string;
  kind: "vault" | "obligation" | "trailer";
  target_lo: string | number | null;
  target_hi?: string | number | null;
  // Bound obligation's live numbers (joined by the caller from obligations).
  obligation?: { current_balance: number | null; original_balance: number | null } | null;
}

// The math reads exactly two roles: the ops account (float/sweep) and the
// vault account (the cascade). Reserve accounts are display-only — the page
// resolves role → balance from plan_accounts before calling in.
export interface SnapshotInput {
  as_of?: string;
  ops: string | number | null;
  vault: string | number | null;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Amount to move Ops → Vault this Friday. 0 = at the line (hold), null = no data.
export const getSweep = (
  ops: string | number | null,
  floatLine: string | number | null,
): number | null => {
  const o = num(ops);
  const f = num(floatLine);
  if (o == null || f == null) return null;
  return Math.max(0, o - f);
};

export interface CushionProgress {
  toFloor: number; // remaining to the floor (0 when past it)
  toGoal: number; // remaining to the goal's low end
  pctFloor: number; // 0..1
  pctGoal: number; // 0..1 toward goalLo
}

export const getCushionProgress = (
  vault: string | number | null,
  floor: string | number | null,
  goalLo: string | number | null,
): CushionProgress | null => {
  const v = num(vault);
  const f = num(floor);
  if (v == null || f == null || f <= 0) return null;
  const g = num(goalLo);
  return {
    toFloor: Math.max(0, f - v),
    toGoal: g != null && g > 0 ? Math.max(0, g - v) : 0,
    pctFloor: Math.min(1, Math.max(0, v / f)),
    pctGoal: g != null && g > 0 ? Math.min(1, Math.max(0, v / g)) : 0,
  };
};

export type StageState = "done" | "active" | "pending";

export interface StageStatus {
  stage: PlanStageInput;
  state: StageState;
  progress: number; // 0..1 — obligation stages measure paid-down share
  currentValue: number | null; // what the meter reads (vault $, balance left, fund $)
  // Active non-vault stages only: dollars above the protected ratchet,
  // available to send this Friday.
  overflow: number | null;
}

export interface WaterfallStatus {
  stages: StageStatus[];
  activeIndex: number | null; // null = every stage done (the plan's finish line)
  protectedLevel: number; // the current vault ratchet
}

// A stage is DONE when its goal holds: vault ≥ target, obligation ≤ $0,
// overflow fund (trailer kind) ≥ target_lo ABOVE the ratchet. An UNBOUND
// obligation stage can't be graded — it rides as pending until it's bound.
const stageDone = (s: PlanStageInput, vault: number, ratchet: number): boolean => {
  const lo = num(s.target_lo) ?? 0;
  if (s.kind === "vault") return vault >= lo;
  if (s.kind === "trailer") return lo > 0 && vault - ratchet >= lo;
  const bal = num(s.obligation?.current_balance ?? null);
  return bal != null && bal <= 0;
};

const stageProgress = (s: PlanStageInput, vault: number, ratchet: number): { pct: number; value: number | null } => {
  const lo = num(s.target_lo) ?? 0;
  if (s.kind === "vault")
    return { pct: lo > 0 ? Math.min(1, Math.max(0, vault / lo)) : 0, value: vault };
  if (s.kind === "trailer") {
    const above = Math.max(0, vault - ratchet);
    return { pct: lo > 0 ? Math.min(1, above / lo) : 0, value: above };
  }
  const bal = num(s.obligation?.current_balance ?? null);
  const orig = num(s.obligation?.original_balance ?? null);
  if (bal == null) return { pct: 0, value: null }; // unbound — ghost until bound
  if (bal <= 0) return { pct: 1, value: 0 };
  if (orig == null || orig <= 0) return { pct: 0, value: bal };
  return { pct: Math.min(1, Math.max(0, (orig - bal) / orig)), value: bal };
};

export const getWaterfallStage = (
  snapshot: SnapshotInput | null,
  stages: PlanStageInput[],
): WaterfallStatus | null => {
  if (!snapshot || stages.length === 0) return null;
  const vault = num(snapshot.vault);
  if (vault == null) return null;

  const ordered = [...stages].sort((a, b) => a.position - b.position);

  // The ratchet: the highest vault threshold among COMPLETED vault stages.
  // Overflow above it funds the active non-vault stage.
  let activeIndex: number | null = null;
  let protectedLevel = 0;
  const out: StageStatus[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    // The ratchet known so far grades this stage — overflow funds measure
    // above it, and it only grows as EARLIER vault stages complete.
    const done = activeIndex === null && stageDone(s, vault, protectedLevel);
    const { pct, value } = stageProgress(s, vault, protectedLevel);
    if (done && s.kind === "vault") {
      protectedLevel = Math.max(protectedLevel, num(s.target_lo) ?? 0);
    }
    if (!done && activeIndex === null) activeIndex = i;
    out.push({
      stage: s,
      state: done ? "done" : "pending", // active is stamped below
      progress: pct,
      currentValue: value,
      overflow: null,
    });
  }

  if (activeIndex !== null) {
    const act = out[activeIndex];
    act.state = "active";
    if (act.stage.kind !== "vault") {
      act.overflow = Math.max(0, vault - protectedLevel);
    }
  }

  return { stages: out, activeIndex, protectedLevel };
};

export interface PlanStatus {
  sweep: number | null;
  cushion: CushionProgress | null;
  waterfall: WaterfallStatus | null;
  verdict: "on-plan" | "below-float" | null;
  orders: string[]; // the Friday marching orders, in plain words
}

export interface PlanInput {
  float_line: string | number | null;
  stages: PlanStageInput[];
}

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export const getPlanStatus = (
  snapshot: SnapshotInput | null,
  plan: PlanInput | null,
): PlanStatus | null => {
  if (!snapshot || !plan) return null;
  const sweep = getSweep(snapshot.ops, plan.float_line);
  const waterfall = getWaterfallStage(snapshot, plan.stages);

  // Cushion reads the FIRST vault stage as the floor, the LAST as the goal.
  const vaultStages = [...plan.stages]
    .filter((s) => s.kind === "vault")
    .sort((a, b) => a.position - b.position);
  const cushion = getCushionProgress(
    snapshot.vault,
    vaultStages[0]?.target_lo ?? null,
    vaultStages[vaultStages.length - 1]?.target_lo ?? null,
  );

  const orders: string[] = [];
  if (sweep != null && sweep > 0) orders.push(`Sweep ${money(sweep)} to the vault`);
  if (sweep != null && sweep === 0) orders.push("Below the float — hold");
  const act =
    waterfall?.activeIndex != null ? waterfall.stages[waterfall.activeIndex] : null;
  if (act && act.overflow != null && act.overflow > 0) {
    orders.push(`${money(act.overflow)} above the ratchet — send it to ${act.stage.label}`);
  }

  const o = Number(snapshot.ops);
  const f = Number(plan.float_line);
  const verdict: PlanStatus["verdict"] =
    !Number.isFinite(o) || !Number.isFinite(f) ? null : o < f ? "below-float" : "on-plan";

  return { sweep, cushion, waterfall, verdict, orders };
};
