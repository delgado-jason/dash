// The Plan page's brain — pure, plan-as-input, so 2028 is data, not a code
// change. All money arrives as Postgres numeric strings; coerce here, once.
//
// ADMIN-03 · Owner distributions (Nod Sheet rev 2, 2026-09-22, #500). Two beats:
//   THE FRIDAY — snapshot first (raw balances in), then the ACCRUAL out: the
//     pay week's miles × $/mile → Maintenance. A closed pay week accrues once,
//     on the first snapshot after it closes (payWeeks.ts owns that clock).
//   THE MONEY DAY — opens when the month's P&L is filed, runs any day, never a
//     Friday rule: TAX = % of pre-tax profit off the top → the INTERLOCK, three
//     floors filled in order Ops → Maintenance → Vault → SURPLUS = ops −
//     accrual − tax − float line, under the minimum nothing moves → every floor
//     holds → the SPLIT: objective % to the current rung, the rest household.
//   dash orders; Excel logs — the seven-line entry is rendered here.
//
// THE CASCADE (Jason, 2026-08-16) still grades the ladder: the vault is one
// account carved by ratcheting thresholds. Each vault-kind stage sets the
// PROTECTED level; money above the highest completed vault threshold is the
// OVERFLOW and still goes, whole, to the current non-vault stage (rev 2 issue
// 11 — the split applies only to the month's surplus out of Ops). Obligation
// stages complete at $0 balance. 'trailer'-kind stages are OVERFLOW FUNDS
// measured above the ratchet — NOT the snapshot's trailer holding account.
// The FIRST vault stage is floor 3 of the interlock; the current OBJECTIVE is
// the first not-done rung after it.

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

// The math reads four roles: ops (the float), vault (the cascade, floor 3),
// maintenance (floor 2, the accrual's home) and tax (the tax move's home).
// Any other reserve is display-only — the page resolves role → balance from
// plan_accounts before calling in.
export interface SnapshotInput {
  as_of?: string;
  ops: string | number | null;
  vault: string | number | null;
  maintenance?: string | number | null;
  tax?: string | number | null;
}

export interface PlanInput {
  float_line: string | number | null;
  stages: PlanStageInput[];
  maintenance_per_mile?: string | number | null;
  tax_pct?: string | number | null;
  maintenance_floor?: string | number | null;
  min_move?: string | number | null;
  objective_pct?: string | number | null;
}

// What the page knows about the day: the pay week(s) owed, and the month
// being settled when the money day is ticked.
export interface AccrualInput {
  miles: string | number | null; // typed or pre-filled; null/blank = nothing accrues today
  weekLabel: string; // "Sep 16–22" (or "Sep 23–Oct 6" over two owed weeks)
  loads: number;
  loadedMiles: number;
  deadheadMiles: number;
  noDeadhead: number; // loads with 0/unlogged deadhead
}

export interface MoneyDayInput {
  month: string; // YYYY-MM-01
  pretaxProfit: number | null; // income − cogs − expenses of the filed P&L
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// "$1,234" · "−$1,431" — whole dollars for orders and the entry.
export const money = (n: number): string => {
  const r = Math.round(n);
  const abs = Math.abs(r).toLocaleString("en-US");
  return r < 0 ? `−$${abs}` : `$${abs}`;
};

const miles = (n: number): string => Math.round(n).toLocaleString("en-US");

// "August 2026" from 'YYYY-MM-01' (UTC-safe — dates are the #1 bug).
export const monthName = (ymd: string): string => {
  const [y, m] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

// The Friday accrual: miles × $/mile. null = no data (never a fake zero).
export const getAccrual = (
  milesDriven: string | number | null,
  perMile: string | number | null,
): number | null => {
  const m = num(milesDriven);
  const r = num(perMile);
  if (m == null || r == null) return null;
  return Math.max(0, m * r);
};

// The tax move: % of the month's pre-tax profit, off the top. A loss moves $0.
export const getTaxMove = (
  pretaxProfit: string | number | null,
  taxPct: string | number | null,
): number | null => {
  const p = num(pretaxProfit);
  const pct = num(taxPct);
  if (p == null || pct == null) return null;
  return Math.max(0, (p * pct) / 100);
};

// The surplus: what's above the float line after the accrual and the tax move.
// 0 = at or under the line (nothing leaves Ops), null = no data.
export const getSurplus = (
  opsAfter: string | number | null,
  floatLine: string | number | null,
): number | null => {
  const o = num(opsAfter);
  const f = num(floatLine);
  if (o == null || f == null) return null;
  return Math.max(0, o - f);
};

// Floor 3 is the ladder's first vault rung.
export const vaultFloorOf = (stages: PlanStageInput[]): number | null => {
  const first = [...stages]
    .filter((s) => s.kind === "vault")
    .sort((a, b) => a.position - b.position)[0];
  return first ? num(first.target_lo) : null;
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

  let activeIndex: number | null = null;
  let protectedLevel = 0;
  const out: StageStatus[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const done = activeIndex === null && stageDone(s, vault, protectedLevel);
    const { pct, value } = stageProgress(s, vault, protectedLevel);
    if (done && s.kind === "vault") {
      protectedLevel = Math.max(protectedLevel, num(s.target_lo) ?? 0);
    }
    if (!done && activeIndex === null) activeIndex = i;
    out.push({ stage: s, state: done ? "done" : "pending", progress: pct, currentValue: value, overflow: null });
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

// The current OBJECTIVE: the first not-done rung that isn't floor 3 (the
// first vault stage). null when the ladder is finished.
export const objectiveIndexOf = (w: WaterfallStatus | null, stages: PlanStageInput[]): number | null => {
  if (!w) return null;
  const floorStage = [...stages].filter((s) => s.kind === "vault").sort((a, b) => a.position - b.position)[0];
  for (let i = 0; i < w.stages.length; i++) {
    const st = w.stages[i];
    if (st.state === "done") continue;
    if (floorStage && st.stage.kind === "vault" && st.stage.position === floorStage.position) continue;
    return i;
  }
  return null;
};

// ---- the interlock ----

export type FloorKey = "ops" | "maintenance" | "vault";

export interface FloorStatus {
  key: FloorKey;
  label: string; // the SOP's word: operating · maintenance · reserve
  balance: number | null; // after the accrual (and, on a money day, the tax move)
  floor: number;
  short: number; // still short AFTER any fill
  fill: number; // directed here from the surplus today
  met: boolean;
  state: "met" | "held" | "next"; // held = the first unmet floor, next = behind it
}

export interface Interlock {
  floors: FloorStatus[]; // in fill order
  heldBy: FloorKey | null; // the floor holding the month, null = all met
  remainder: number; // surplus left after the fills — splits only when heldBy is null
}

export const getInterlock = (
  bal: { opsAfter: number | null; maintenanceAfter: number | null; vault: number | null },
  floors: { ops: number; maintenance: number; vault: number },
  avail: number, // the surplus available to direct (0 on a plain Friday or under the minimum)
): Interlock => {
  let left = Math.max(0, avail);
  const ops: FloorStatus = {
    key: "ops", label: "operating", balance: bal.opsAfter, floor: floors.ops,
    short: bal.opsAfter == null ? floors.ops : Math.max(0, floors.ops - bal.opsAfter),
    fill: 0, met: false, state: "next",
  };
  ops.met = ops.short <= 0;

  const mShort = bal.maintenanceAfter == null ? floors.maintenance : Math.max(0, floors.maintenance - bal.maintenanceAfter);
  const mFill = Math.min(left, mShort);
  left -= mFill;
  const maintenance: FloorStatus = {
    key: "maintenance", label: "maintenance", balance: bal.maintenanceAfter, floor: floors.maintenance,
    short: mShort - mFill, fill: mFill, met: mShort - mFill <= 0, state: "next",
  };

  const vShort = Math.max(0, floors.vault - (bal.vault ?? 0));
  const vFill = Math.min(left, vShort);
  left -= vFill;
  const vault: FloorStatus = {
    key: "vault", label: "reserve", balance: bal.vault, floor: floors.vault,
    short: vShort - vFill, fill: vFill, met: vShort - vFill <= 0, state: "next",
  };

  const list = [ops, maintenance, vault];
  let heldBy: FloorKey | null = null;
  for (const f of list) {
    if (f.met) f.state = "met";
    else if (heldBy === null) { heldBy = f.key; f.state = "held"; }
  }
  return { floors: list, heldBy, remainder: heldBy === null ? left : 0 };
};

// ---- the money day ----

export interface MoneyDay {
  month: string; // YYYY-MM-01
  monthLabel: string; // "August 2026"
  pretaxProfit: number;
  taxPct: number;
  tax: number;
  accrual: number; // the accrual taken on the same snapshot (0 if none)
  opsBefore: number;
  opsAfter: number; // ops − accrual − tax
  surplus: number; // max(0, opsAfter − float)
  minMove: number;
  belowMin: boolean; // 0 < surplus < minimum → nothing moves
  interlock: Interlock;
  objective: number;
  household: number;
  objectiveLabel: string | null;
  entry: string[]; // the seven-line entry for Excel
}

// "MONTH ..........." — the SOP's seven-line layout, dots to column 17.
const pad = (label: string): string => `${label} `.padEnd(17, ".");

const buildEntry = (md: Omit<MoneyDay, "entry">, floatLine: number): string[] => {
  const { interlock: il } = md;
  const [ops, maint, vault] = il.floors;
  const lines: string[] = [];
  lines.push(`${pad("MONTH")} ${md.monthLabel}`);
  lines.push(`${pad("Pre-tax profit")} ${money(md.pretaxProfit)}`);
  lines.push(`${pad("Tax swept")} ${money(md.tax)}   (${md.taxPct} % per plan${md.pretaxProfit < 0 ? " — a loss month" : ""})`);
  const obj = md.objectiveLabel ?? "the current objective";
  const floorWord = (f: FloorStatus) => `${f.label} ${f.met ? "met" : "UNMET"}`;
  const surplusWhy = `(Ops ${money(md.opsBefore - md.accrual)} after the accrual − ${money(md.tax)} tax − ${money(floatLine)} floor)`;

  if (il.heldBy === "ops") {
    // The SOP's interlock template — six lines.
    lines.push(`${pad("Floors")} HELD — operating, short ${money(ops.short)}   (maintenance short ${money(maint.short)} · reserve short ${money(vault.short)})`);
    lines.push(`${pad("Surplus")} $0   ${surplusWhy}`);
    lines.push(`${pad("Distribution")} $0 — interlock`);
    return lines;
  }
  if (md.belowMin) {
    lines.push(`${pad("Floors")} ${il.floors.map(floorWord).join(" · ")}`);
    lines.push(`${pad("Surplus")} ${money(md.surplus)}   — under the ${money(md.minMove)} minimum, nothing moves`);
    lines.push(`${pad("Objective")} $0   → ${obj} — under the minimum`);
    lines.push(`${pad("Distribution")} $0 — under the minimum`);
    return lines;
  }
  const fills = il.floors.filter((f) => f.fill > 0);
  if (il.heldBy !== null) {
    const held = il.floors.find((f) => f.key === il.heldBy)!;
    const others = il.floors.filter((f) => f.key !== il.heldBy).map(floorWord).join(" · ");
    lines.push(`${pad("Floors")} HELD — ${held.label}, short ${money(held.short)}   (${others})`);
    const directed = fills.map((f) => `${f.key === "vault" ? "the Vault" : f.key === "maintenance" ? "Maintenance" : "Ops"} ${money(f.fill)}${f.balance != null ? ` (now ${money(f.balance + f.fill)} of ${money(f.floor)})` : ""}`).join(" · ");
    lines.push(`${pad("Surplus")} ${money(md.surplus)}   → directed to ${directed || held.label}`);
    lines.push(`${pad("Objective")} $0   → ${obj} — interlock`);
    lines.push(`${pad("Distribution")} $0 — interlock`);
    return lines;
  }
  // Every floor holds — the standard template, seven lines.
  const filledToday = fills.map((f) => `${f.key === "vault" ? "reserve" : f.label} filled ${money(f.fill)} today`).join(" · ");
  lines.push(`${pad("Floors")} ${filledToday ? `${filledToday} · all met` : il.floors.map(floorWord).join(" · ")}`);
  lines.push(`${pad("Surplus")} ${money(md.surplus)}   ${surplusWhy}`);
  lines.push(`${pad("Objective")} ${money(md.objective)}   → ${obj}`);
  lines.push(`${pad("Distribution")} ${money(md.household)}   → household`);
  return lines;
};

export const getMoneyDay = (
  snapshot: SnapshotInput | null,
  plan: PlanInput | null,
  md: MoneyDayInput | null,
  accrual: number | null,
  objectiveLabel: string | null,
): MoneyDay | null => {
  if (!snapshot || !plan || !md) return null;
  const ops = num(snapshot.ops);
  const floatLine = num(plan.float_line);
  const pretax = num(md.pretaxProfit);
  const taxPct = num(plan.tax_pct);
  if (ops == null || floatLine == null || pretax == null || taxPct == null) return null;
  const acc = accrual ?? 0;
  const tax = getTaxMove(pretax, taxPct) ?? 0;
  const opsAfter = ops - acc - tax;
  const surplus = getSurplus(opsAfter, floatLine) ?? 0;
  const minMove = num(plan.min_move) ?? 0;
  const belowMin = surplus > 0 && surplus < minMove;
  const maint = num(snapshot.maintenance);
  const interlock = getInterlock(
    { opsAfter, maintenanceAfter: maint == null ? null : maint + acc, vault: num(snapshot.vault) },
    { ops: floatLine, maintenance: num(plan.maintenance_floor) ?? 0, vault: vaultFloorOf(plan.stages) ?? 0 },
    belowMin ? 0 : surplus,
  );
  const objPct = num(plan.objective_pct) ?? 70;
  const objective = interlock.remainder * (objPct / 100);
  const household = interlock.remainder - objective;
  const base = {
    month: md.month, monthLabel: monthName(md.month), pretaxProfit: pretax, taxPct, tax,
    accrual: acc, opsBefore: ops, opsAfter, surplus, minMove, belowMin, interlock,
    objective, household, objectiveLabel,
  };
  return { ...base, entry: buildEntry(base, floatLine) };
};

// ---- the whole verdict ----

export interface PlanStatus {
  accrual: number | null; // this snapshot's maintenance move (null = no miles given)
  accrualFlag: string | null; // "1 of 2 loads has no deadhead logged — …"
  opsAfter: number | null; // ops − accrual (− tax on a money day)
  verdict: "on-plan" | "floors-first" | "below-float" | null;
  interlock: Interlock | null; // the three floors as the balances stand (fills only on a money day)
  cushion: CushionProgress | null;
  waterfall: WaterfallStatus | null;
  objectiveIndex: number | null;
  moneyDay: MoneyDay | null;
  orders: string[]; // the marching orders, in plain words
}

export const getPlanStatus = (
  snapshot: SnapshotInput | null,
  plan: PlanInput | null,
  ctx: { accrual?: AccrualInput | null; moneyDay?: MoneyDayInput | null } = {},
): PlanStatus | null => {
  if (!snapshot || !plan) return null;
  const perMile = num(plan.maintenance_per_mile);
  const acc = ctx.accrual ? getAccrual(ctx.accrual.miles, perMile) : null;
  const accrualFlag =
    ctx.accrual && ctx.accrual.noDeadhead > 0
      ? `${ctx.accrual.noDeadhead} of ${ctx.accrual.loads} load${ctx.accrual.loads === 1 ? " has" : "s have"} no deadhead logged — fix the load or edit the miles`
      : null;

  const waterfall = getWaterfallStage(snapshot, plan.stages);
  const objectiveIndex = objectiveIndexOf(waterfall, plan.stages);
  const objectiveLabel = objectiveIndex != null && waterfall ? waterfall.stages[objectiveIndex].stage.label : null;

  const vaultStages = [...plan.stages].filter((s) => s.kind === "vault").sort((a, b) => a.position - b.position);
  const cushion = getCushionProgress(
    snapshot.vault,
    vaultStages[0]?.target_lo ?? null,
    vaultStages[vaultStages.length - 1]?.target_lo ?? null,
  );

  const moneyDay = getMoneyDay(snapshot, plan, ctx.moneyDay ?? null, acc, objectiveLabel);

  const ops = num(snapshot.ops);
  const floatLine = num(plan.float_line);
  const maint = num(snapshot.maintenance);
  const opsAfter = moneyDay ? moneyDay.opsAfter : ops == null ? null : ops - (acc ?? 0);
  const interlock =
    floatLine == null
      ? null
      : moneyDay
        ? moneyDay.interlock
        : getInterlock(
            { opsAfter, maintenanceAfter: maint == null ? null : maint + (acc ?? 0), vault: num(snapshot.vault) },
            { ops: floatLine, maintenance: num(plan.maintenance_floor) ?? 0, vault: vaultFloorOf(plan.stages) ?? 0 },
            0,
          );

  // The verdict reads where the balances stand after the accrual, before any
  // fill: under the float → HOLD; float held but a reserve under its floor →
  // FLOORS FIRST; every floor holds → ON PLAN.
  let verdict: PlanStatus["verdict"] = null;
  if (opsAfter != null && floatLine != null) {
    if (opsAfter < floatLine) verdict = "below-float";
    else {
      const mFloor = num(plan.maintenance_floor) ?? 0;
      const vFloor = vaultFloorOf(plan.stages) ?? 0;
      const mOk = maint == null ? mFloor <= 0 : maint + (acc ?? 0) >= mFloor;
      const vOk = (num(snapshot.vault) ?? 0) >= vFloor;
      verdict = mOk && vOk ? "on-plan" : "floors-first";
    }
  }

  const orders: string[] = [];
  if (acc != null && ctx.accrual && perMile != null) {
    const m = num(ctx.accrual.miles) ?? 0;
    orders.push(`Accrue Maintenance ${money(acc)} (${miles(m)} mi × $${perMile})`);
  }
  if (moneyDay) {
    const il = moneyDay.interlock;
    orders.push(
      `Tax ${money(moneyDay.tax)} (${moneyDay.monthLabel}: ${moneyDay.pretaxProfit < 0 ? "a loss" : `${moneyDay.taxPct} % of ${money(moneyDay.pretaxProfit)}`})`,
    );
    if (il.heldBy === "ops") {
      orders.push(`Surplus $0 — held by the operating floor, short ${money(il.floors[0].short)}`);
    } else if (moneyDay.belowMin) {
      orders.push(`Surplus ${money(moneyDay.surplus)} — under the ${money(moneyDay.minMove)} minimum, nothing moves`);
    } else {
      for (const f of il.floors) {
        if (f.fill > 0) orders.push(`${f.key === "vault" ? "Vault" : "Maintenance"} ${money(f.fill)} (floor ${f.key === "maintenance" ? 2 : 3})`);
      }
      if (il.heldBy !== null) {
        const held = il.floors.find((f) => f.key === il.heldBy)!;
        orders.push(`held by the ${held.label} floor, short ${money(held.short)}`);
      } else if (il.remainder > 0) {
        orders.push(`${objectiveLabel ?? "Objective"} ${money(moneyDay.objective)} · Household ${money(moneyDay.household)}`);
      } else {
        orders.push("Surplus $0 — nothing to split");
      }
    }
  } else if (opsAfter != null && floatLine != null && opsAfter < floatLine) {
    orders.push("Below the float — hold");
  }
  const act = waterfall?.activeIndex != null ? waterfall.stages[waterfall.activeIndex] : null;
  if (act && act.overflow != null && act.overflow > 0) {
    orders.push(`${money(act.overflow)} above the ratchet — send it to ${act.stage.label}`);
  }

  return { accrual: acc, accrualFlag, opsAfter, verdict, interlock, cushion, waterfall, objectiveIndex, moneyDay, orders };
};
