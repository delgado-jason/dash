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

import { requireInputs, missingWords, type MissingInput } from "@/lib/integrity/require";

// ---- the words a refusal speaks (PLAN-06, Nod Sheet "The Protection Stage",
// call 5): each input the Plan page's figures need, and where it is set. A
// balance is typed in the Friday snapshot; every plan number is in EDIT PLAN.
export const FIX_SNAPSHOT = "FRIDAY SNAPSHOT";
export const FIX_PLAN = "EDIT PLAN";
const w = (key: string, label: string, fixAt: string, fixTo?: string): MissingInput => ({ key, label, fixAt, ...(fixTo ? { fixTo } : {}) });
export const WORDS = {
  ops: w("balance_ops", "the Ops balance", FIX_SNAPSHOT),
  maintenance: w("balance_maintenance", "the Maintenance balance", FIX_SNAPSHOT),
  vault: w("balance_vault", "the Vault balance", FIX_SNAPSHOT),
  miles: w("accrual_miles", "the pay week's mileage", FIX_SNAPSHOT),
  per_mile: w("maintenance_per_mile", "the maintenance $/mile", FIX_PLAN),
  float_line: w("float_line", "the float line", FIX_PLAN),
  tax_pct: w("tax_pct", "the tax percent", FIX_PLAN),
  min_move: w("min_move", "the minimum move", FIX_PLAN),
  maintenance_floor: w("maintenance_floor", "the Maintenance floor", FIX_PLAN),
  objective_pct: w("objective_pct", "the objective percent", FIX_PLAN),
  vault_floor: w("vault_floor", "a Vault rung to carry the reserve floor", FIX_PLAN),
  pretax: w("pretax_profit", "the month's pre-tax profit", "the Expenses P&L", "/expenses"),
};

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
  // ---- where the miles came from (Cash Board Nod Sheet issue 8, nodded
  // 2026-09-30): the accrual runs on EVERY mile the truck rolls, so the
  // pre-fill is the odometer chain's delta and the loads' figure rides
  // along for the transition. All optional — an input without `source` is
  // the pre-issue-8 loads-only shape and keeps the deadhead flag.
  source?: "odometer" | "loads";
  odometerMiles?: number | null; // null = no reading before the week
  loadsMiles?: number; // loaded + deadhead of the loads picked up in the week
  readingsWords?: string | null; // "603,232 on Sep 22 → 605,222 on Sep 29"
  endSlips?: boolean; // the end reading predates the boundary — the miles ride into next week
  backwards?: number; // readings that go backwards inside the span — a typo to fix
  implausibleMiles?: number | null; // a week's delta too big to be real — the too-HIGH typo
  // ---- closed weeks re-true (Nod Sheet 2026-11-04, call 8): the miles the
  // odometer chain found after the fact across every week that already
  // accrued (accrualTruth.ts). They ride into this accrual, once, and `miles`
  // above already includes them — these two are for the words.
  catchUpMiles?: number | null; // > 0 never accrued · < 0 over-accrued · null/0 = nothing to re-true
  catchUpLabel?: string | null; // "Sep 16–Oct 27"
}

export interface MoneyDayInput {
  month: string; // YYYY-MM-01
  pretaxProfit: number | null; // income − cogs − expenses of the filed P&L
  // The three lines behind it, for the entry's breakdown (optional).
  income?: number | null;
  cogs?: number | null;
  expenses?: number | null;
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

// "1 of 2 loads have no deadhead logged — …" — the loads-only miles problem.
const deadheadFlag = (a: AccrualInput): string | null =>
  a.noDeadhead > 0
    ? `${a.noDeadhead} of ${a.loads} load${a.loads === 1 ? " has" : "s have"} no deadhead logged — fix the load or edit the miles`
    : null;

// The one thing wrong with today's miles, worst first (issue 8): a backwards
// reading is a typo and stops the money, and so does its mirror — a reading
// typed too HIGH, which shows up as an impossible week; falling back to the
// loads is worth saying (and still carries the deadhead problem); on the
// odometer chain the deadhead flag no longer applies — unlogged deadhead is
// already in the delta.
export const accrualFlagOf = (a: AccrualInput | null | undefined): string | null => {
  if (!a) return null;
  const back = a.backwards ?? 0;
  if (back > 0)
    return `${back} odometer reading${back === 1 ? " goes" : "s go"} backwards — fix the entry before moving money`;
  if (a.implausibleMiles != null && a.implausibleMiles > 0)
    return `${miles(a.implausibleMiles)} mi in one pay week is too high to be real — fix the odometer entry before moving money`;
  if (a.source === "loads") {
    const dh = deadheadFlag(a);
    return `no odometer reading before the week — miles from the loads${dh ? `; ${dh}` : ""}`;
  }
  if (a.source === "odometer") return null;
  return deadheadFlag(a);
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

// The words for an unset reserve floor: the rung that should carry it, or the
// absence of any vault rung.
export const vaultFloorMissing = (stages: PlanStageInput[]): MissingInput => {
  const first = [...stages]
    .filter((s) => s.kind === "vault")
    .sort((a, b) => a.position - b.position)[0];
  return first ? stageTargetWords(first) : WORDS.vault_floor;
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

export type StageState = "done" | "active" | "pending" | "unknown";

export interface StageStatus {
  stage: PlanStageInput;
  state: StageState; // "unknown" = the rung has no target, so it can't be judged (PLAN-06)
  progress: number; // 0..1 — obligation stages measure paid-down share
  currentValue: number | null; // what the meter reads (vault $, balance left, fund $)
  // Active non-vault stages only: dollars above the protected ratchet,
  // available to send this Friday.
  overflow: number | null;
  missing: MissingInput[]; // the target this rung needs and doesn't have
}

export interface WaterfallStatus {
  stages: StageStatus[];
  // null = every stage done (the plan's finish line) — OR the walk stopped at
  // a rung with no target: then `refusedAt` names it and activeIndex stays null.
  activeIndex: number | null;
  protectedLevel: number; // the current vault ratchet (what the done rungs before a refusal protect)
  refusedAt: number | null; // the first rung that needed a target it doesn't have
  missing: MissingInput[]; // every rung target that is unset, in ladder order
}

// A vault or trailer rung is measured against its target; an obligation rung
// is measured by its bound balance and needs none.
export const stageTargetWords = (s: PlanStageInput): MissingInput => ({
  key: `stage_${s.position}_target`,
  label: `rung ${s.position}'s target`,
  fixAt: FIX_PLAN,
});

const stageDone = (s: PlanStageInput, lo: number | null, vault: number, ratchet: number): boolean => {
  if (s.kind === "vault") return lo != null && vault >= lo;
  if (s.kind === "trailer") return lo != null && lo > 0 && vault - ratchet >= lo;
  const bal = num(s.obligation?.current_balance ?? null);
  return bal != null && bal <= 0;
};

const stageProgress = (
  s: PlanStageInput,
  lo: number | null,
  vault: number,
  ratchet: number,
): { pct: number; value: number | null } => {
  if (s.kind === "vault")
    return { pct: lo != null && lo > 0 ? Math.min(1, Math.max(0, vault / lo)) : 0, value: vault };
  if (s.kind === "trailer") {
    const above = Math.max(0, vault - ratchet);
    return { pct: lo != null && lo > 0 ? Math.min(1, above / lo) : 0, value: above };
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
  let refusedAt: number | null = null;
  let protectedLevel = 0;
  const out: StageStatus[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const lo = num(s.target_lo);
    // A rung that is measured against a target and has none REFUSES — it is
    // never a $0 target (PLAN-06). The first such rung before the active one
    // stops the walk: nothing behind it can be judged.
    if (s.kind !== "obligation" && lo == null) {
      if (activeIndex === null && refusedAt === null) refusedAt = i;
      out.push({
        stage: s, state: refusedAt === i ? "unknown" : "pending", progress: 0,
        currentValue: s.kind === "vault" ? vault : null, overflow: null, missing: [stageTargetWords(s)],
      });
      continue;
    }
    if (refusedAt !== null) {
      out.push({ stage: s, state: "pending", progress: 0, currentValue: null, overflow: null, missing: [] });
      continue;
    }
    const done = activeIndex === null && stageDone(s, lo, vault, protectedLevel);
    const { pct, value } = stageProgress(s, lo, vault, protectedLevel);
    if (done && s.kind === "vault" && lo != null) {
      protectedLevel = Math.max(protectedLevel, lo);
    }
    if (!done && activeIndex === null) activeIndex = i;
    out.push({ stage: s, state: done ? "done" : "pending", progress: pct, currentValue: value, overflow: null, missing: [] });
  }

  if (activeIndex !== null) {
    const act = out[activeIndex];
    act.state = "active";
    if (act.stage.kind !== "vault") {
      act.overflow = Math.max(0, vault - protectedLevel);
    }
  }

  return { stages: out, activeIndex, protectedLevel, refusedAt, missing: out.flatMap((o) => o.missing) };
};

// The current OBJECTIVE: the first not-done rung that isn't floor 3 (the
// first vault stage). null when the ladder is finished.
export const objectiveIndexOf = (w: WaterfallStatus | null, stages: PlanStageInput[]): number | null => {
  if (!w) return null;
  const floorStage = [...stages].filter((s) => s.kind === "vault").sort((a, b) => a.position - b.position)[0];
  for (let i = 0; i < w.stages.length; i++) {
    const st = w.stages[i];
    // A rung with no target can't be judged: it is the objective unless it is
    // floor 3 itself, in which case nothing behind it is known.
    if (st.state === "unknown")
      return floorStage && st.stage.kind === "vault" && st.stage.position === floorStage.position ? null : i;
    if (st.state === "done") continue;
    if (floorStage && st.stage.kind === "vault" && st.stage.position === floorStage.position) continue;
    return i;
  }
  return null;
};

// ---- the interlock ----

export type FloorKey = "ops" | "maintenance" | "vault";

// A floor is UNKNOWN when it lacks the balance or the floor it is measured
// by — it never reads as a $0 balance or a $0 floor (PLAN-06).
export interface FloorStatus {
  key: FloorKey;
  label: string; // the SOP's word: operating · maintenance · reserve
  balance: number | null; // after the accrual (and, on a money day, the tax move)
  floor: number | null; // null = no floor set
  short: number | null; // still short AFTER any fill; null = unknown
  fill: number; // directed here from the surplus today
  met: boolean | null; // null = unknown
  state: "met" | "held" | "next" | "unknown"; // held = the first unmet floor, next = behind it
  missing: MissingInput[]; // what this floor is waiting for
}

export interface Interlock {
  floors: FloorStatus[]; // in fill order
  heldBy: FloorKey | null; // the floor holding the month, null = all met (or still waiting — see waitingOn)
  remainder: number; // surplus left after the fills — splits only when heldBy is null and nothing is waiting
  waitingOn: MissingInput[]; // every input an unknown floor needs; non-empty = the interlock is not final
}

const dedupe = (list: MissingInput[]): MissingInput[] => {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
};

export const getInterlock = (
  bal: { opsAfter: number | null; maintenanceAfter: number | null; vault: number | null },
  floors: { ops: number | null; maintenance: number | null; vault: number | null },
  avail: number, // the surplus available to direct (0 on a plain Friday or under the minimum)
  // Why a balance is null when it isn't simply untyped (an unknown accrual),
  // and the words for an unset vault floor (which rung is missing its target).
  why: { blame?: Partial<Record<FloorKey, MissingInput[]>>; vaultFloor?: MissingInput } = {},
): Interlock => {
  let left = Math.max(0, avail);
  let blocked = false; // an unknown floor ahead: nothing can be directed past it

  const missingFor = (key: FloorKey, balance: number | null, floor: number | null): MissingInput[] => {
    const out: MissingInput[] = [];
    if (floor == null) out.push(key === "ops" ? WORDS.float_line : key === "maintenance" ? WORDS.maintenance_floor : why.vaultFloor ?? WORDS.vault_floor);
    if (balance == null) out.push(...(why.blame?.[key] ?? [key === "ops" ? WORDS.ops : key === "maintenance" ? WORDS.maintenance : WORDS.vault]));
    return out;
  };

  const ops: FloorStatus = { key: "ops", label: "operating", balance: bal.opsAfter, floor: floors.ops, short: null, fill: 0, met: null, state: "next", missing: missingFor("ops", bal.opsAfter, floors.ops) };
  if (ops.missing.length === 0 && ops.balance != null && ops.floor != null) {
    ops.short = Math.max(0, ops.floor - ops.balance);
    ops.met = ops.short <= 0;
  } else blocked = true;

  const direct = (f: FloorStatus): void => {
    if (f.missing.length > 0 || f.balance == null || f.floor == null) {
      blocked = true;
      return;
    }
    const need = Math.max(0, f.floor - f.balance);
    const fill = blocked ? 0 : Math.min(left, need);
    left -= fill;
    f.fill = fill;
    f.short = need - fill;
    f.met = need - fill <= 0;
  };

  const maintenance: FloorStatus = {
    key: "maintenance", label: "maintenance", balance: bal.maintenanceAfter, floor: floors.maintenance,
    short: null, fill: 0, met: null, state: "next", missing: missingFor("maintenance", bal.maintenanceAfter, floors.maintenance),
  };
  direct(maintenance);
  const vault: FloorStatus = {
    key: "vault", label: "reserve", balance: bal.vault, floor: floors.vault,
    short: null, fill: 0, met: null, state: "next", missing: missingFor("vault", bal.vault, floors.vault),
  };
  direct(vault);

  const list = [ops, maintenance, vault];
  let heldBy: FloorKey | null = null;
  let waiting = false;
  for (const f of list) {
    if (f.met === true) f.state = "met";
    else if (f.met === null) {
      f.state = "unknown";
      waiting = true;
    } else if (heldBy === null && !waiting) {
      heldBy = f.key;
      f.state = "held";
    }
  }
  return {
    floors: list,
    heldBy,
    remainder: heldBy === null && !waiting ? left : 0,
    waitingOn: dedupe(list.flatMap((f) => f.missing)),
  };
};

// ---- the money day ----

export interface MoneyDay {
  month: string; // YYYY-MM-01
  monthLabel: string; // "August 2026"
  pretaxProfit: number;
  income: number | null;
  cogs: number | null;
  expenses: number | null;
  taxPct: number;
  tax: number;
  accrual: number; // the accrual taken on the same snapshot (0 only when none is owed or it already moved)
  opsBefore: number;
  opsAfter: number; // ops − accrual − tax
  surplus: number; // max(0, opsAfter − float)
  minMove: number;
  belowMin: boolean; // 0 < surplus < minimum → nothing moves
  interlock: Interlock;
  objective: number; // whole dollars — the two halves always add back to the remainder
  household: number;
  objectiveLabel: string | null;
  entry: string[]; // the SOP's seven-line entry for Excel (continuation lines indented)
}

// "MONTH ..........." — the SOP's seven-line layout: dots to column 17, the
// value, then an annotation from a fixed column; detail that won't fit rides
// a continuation line indented under the value. Plain text, so Excel gets
// exactly what the page shows.
const pad = (label: string): string => `${label} `.padEnd(17, ".");
const CONT = " ".repeat(18);
const line = (label: string, value: string, note?: string): string =>
  `${pad(label)} ${note ? `${value.padEnd(12)} ${note}` : value}`;
const floorName = (f: FloorStatus): string => (f.key === "vault" ? "the Vault" : f.key === "maintenance" ? "Maintenance" : "Ops");
// A figure that may be unknown: the word, never a dollar sign on nothing.
const moneyOr = (n: number | null, unknown = "unset"): string => (n == null ? unknown : money(n));

const buildEntry = (md: Omit<MoneyDay, "entry">, floatLine: number): string[] => {
  const { interlock: il } = md;
  const [ops, maint, vault] = il.floors;
  const obj = md.objectiveLabel ?? "the current objective";
  const lines: string[] = [];
  lines.push(line("MONTH", md.monthLabel));
  const breakdown =
    md.income != null && md.cogs != null && md.expenses != null
      ? `income ${money(md.income)} − cogs ${money(md.cogs)} − expenses ${money(md.expenses)}`
      : undefined;
  lines.push(line("Pre-tax profit", money(md.pretaxProfit), breakdown));
  lines.push(line("Tax swept", money(md.tax), `${md.taxPct} % per plan${md.pretaxProfit < 0 ? " — a loss month" : ""}`));
  const surplusWhy =
    `Ops ${money(md.opsBefore - md.accrual)}${md.accrual > 0 ? ` after the ${money(md.accrual)} accrual` : ""}` +
    `${md.tax > 0 ? ` − ${money(md.tax)} tax` : ""} − ${money(floatLine)} floor`;
  // "operating met · maintenance met ($5,413 after the accrual)" / "reserve UNMET ($0 of $15,000)"
  const floorWord = (f: FloorStatus): string =>
    f.met
      ? `${f.label} met${f.key === "maintenance" && md.accrual > 0 && f.balance != null ? ` (${money(f.balance)} after the accrual)` : ""}`
      : f.balance == null
        ? `${f.label} UNKNOWN (no balance typed)`
        : `${f.label} UNMET (${money(f.balance)} of ${moneyOr(f.floor)})`;
  const floorsList = (): string[] => {
    const met = il.floors.filter((f) => f.met).map(floorWord);
    const unmet = il.floors.filter((f) => !f.met).map(floorWord);
    const out = [line("Floors", met.join(" · ") || unmet.shift()!)];
    if (unmet.length) out.push(`${CONT}${unmet.join(" · ")}`);
    return out;
  };
  const fills = il.floors.filter((f) => f.fill > 0);
  const directed = fills
    .map((f) => (f.balance == null ? `${floorName(f)} (+${money(f.fill)} today)` : `${floorName(f)} (now ${money(f.balance + f.fill)} of ${moneyOr(f.floor)})`))
    .join(" · ");

  if (il.heldBy === "ops") {
    // The SOP's interlock template — six lines.
    lines.push(line("Floors", `HELD — operating, short ${moneyOr(ops.short, "unknown")}`));
    lines.push(`${CONT}${[maint, vault].map((f) => (f.met ? `${f.label} met` : `${f.label} short ${moneyOr(f.short, "unknown")}`)).join(" · ")}`);
    lines.push(line("Surplus", "$0", surplusWhy));
    lines.push(line("Distribution", "$0 — interlock"));
    return lines;
  }
  if (md.belowMin) {
    lines.push(...floorsList());
    lines.push(line("Surplus", money(md.surplus), `under the ${money(md.minMove)} minimum, nothing moves`));
    lines.push(line("Objective", `$0   → ${obj} — under the minimum`));
    lines.push(line("Distribution", "$0 — under the minimum"));
    return lines;
  }
  if (il.heldBy !== null) {
    // A floor still holds after the fills — the surplus went to the floors.
    lines.push(...floorsList());
    lines.push(line("Surplus", money(md.surplus), surplusWhy));
    if (directed) lines.push(`${CONT}→ directed to ${directed}`);
    lines.push(line("Objective", `$0   → ${obj} — interlock`));
    lines.push(line("Distribution", "$0 — interlock"));
    return lines;
  }
  // Every floor holds — the standard template, seven lines.
  if (fills.length) {
    lines.push(line("Floors", `met (${fills.map((f) => `${f.label === "reserve" ? "reserve" : f.label} filled ${money(f.fill)} today`).join(" · ")})`));
  } else {
    lines.push(...floorsList());
  }
  lines.push(line("Surplus", money(md.surplus), surplusWhy));
  if (directed) lines.push(`${CONT}→ directed to ${directed}`);
  lines.push(line("Objective", `${money(md.objective)}   → ${obj}`));
  lines.push(line("Distribution", `${money(md.household)}   → household`));
  return lines;
};

// What a refused figure carries: the verb the page prints after "Can't …" and
// the inputs that are missing (MissingInputLine reads exactly this).
export interface Refusal {
  what: string; // "run the money day"
  missing: MissingInput[];
}

export const MONEY_DAY_WHAT = "run the money day";

// The money day never moves money on a guess. It needs the balances it reads,
// the plan numbers it applies and the month's profit — and the accrual taken
// on the same snapshot, when one is owed. Anything unset REFUSES (Nod Sheet
// "The Protection Stage", call 5). `accrual` null = unknown; a snapshot that
// owes no accrual (or whose accrual already moved) passes 0, honestly.
export const runMoneyDay = (
  snapshot: SnapshotInput | null,
  plan: PlanInput | null,
  md: MoneyDayInput | null,
  accrual: number | null,
  objectiveLabel: string | null,
  accrualWhy?: MissingInput[],
): { moneyDay: MoneyDay | null; refused: Refusal | null } => {
  if (!snapshot || !plan || !md) return { moneyDay: null, refused: null };
  const vaultFloorWords = vaultFloorMissing(plan.stages);
  const need = requireInputs(
    {
      ops: snapshot.ops,
      maintenance: snapshot.maintenance,
      vault: snapshot.vault,
      float_line: plan.float_line,
      tax_pct: plan.tax_pct,
      min_move: plan.min_move,
      maintenance_floor: plan.maintenance_floor,
      objective_pct: plan.objective_pct,
      vault_floor: vaultFloorOf(plan.stages),
      pretax: md.pretaxProfit,
    },
    {
      ops: WORDS.ops, maintenance: WORDS.maintenance, vault: WORDS.vault,
      float_line: WORDS.float_line, tax_pct: WORDS.tax_pct, min_move: WORDS.min_move,
      maintenance_floor: WORDS.maintenance_floor, objective_pct: WORDS.objective_pct,
      vault_floor: vaultFloorWords, pretax: WORDS.pretax,
    },
  );
  const missing: MissingInput[] = need.ok ? [] : [...need.missing];
  if (accrual == null) missing.push(...(accrualWhy && accrualWhy.length ? accrualWhy : [WORDS.miles]));
  const refuse = (m: MissingInput[]) => ({ moneyDay: null, refused: { what: MONEY_DAY_WHAT, missing: dedupe(m) } });
  if (!need.ok || accrual == null) return refuse(missing);

  const v = need.values;
  const tax = getTaxMove(v.pretax, v.tax_pct);
  if (tax == null) return refuse([WORDS.tax_pct, WORDS.pretax]); // unreachable: both inputs were present
  const opsAfter = v.ops - accrual - tax;
  const surplus = getSurplus(opsAfter, v.float_line);
  if (surplus == null) return refuse([WORDS.ops, WORDS.float_line]); // unreachable: both inputs were present
  const belowMin = surplus > 0 && surplus < v.min_move;
  const interlock = getInterlock(
    { opsAfter, maintenanceAfter: v.maintenance + accrual, vault: v.vault },
    { ops: v.float_line, maintenance: v.maintenance_floor, vault: v.vault_floor },
    belowMin ? 0 : surplus,
  );
  // Whole dollars, and the two halves always add back to the remainder —
  // the entry's Surplus, Objective and Distribution lines must reconcile.
  const objective = Math.round(interlock.remainder * (v.objective_pct / 100));
  const household = Math.round(interlock.remainder) - objective;
  const base = {
    month: md.month, monthLabel: monthName(md.month), pretaxProfit: v.pretax,
    income: num(md.income ?? null), cogs: num(md.cogs ?? null), expenses: num(md.expenses ?? null), taxPct: v.tax_pct, tax,
    accrual, opsBefore: v.ops, opsAfter, surplus, minMove: v.min_move, belowMin, interlock,
    objective, household, objectiveLabel,
  };
  return { moneyDay: { ...base, entry: buildEntry(base, v.float_line) }, refused: null };
};

export const getMoneyDay = (
  snapshot: SnapshotInput | null,
  plan: PlanInput | null,
  md: MoneyDayInput | null,
  accrual: number | null,
  objectiveLabel: string | null,
): MoneyDay | null => runMoneyDay(snapshot, plan, md, accrual, objectiveLabel).moneyDay;

// ---- the whole verdict ----

export interface PlanStatus {
  accrual: number | null; // this snapshot's maintenance move (null = no miles given)
  accrualFlag: string | null; // "2 odometer readings go backwards — …" / "1 of 2 loads has no deadhead logged — …"
  opsAfter: number | null; // ops − accrual (− tax on a money day); null = unknown
  verdict: "on-plan" | "floors-first" | "below-float" | null;
  // Why the verdict is null on a snapshot: the inputs it waits for ("waits for
  // the Tax balance"). Empty when the verdict stands (or there is nothing to judge).
  waitingOn: MissingInput[];
  interlock: Interlock | null; // the three floors as the balances stand (fills only on a money day)
  cushion: CushionProgress | null;
  waterfall: WaterfallStatus | null;
  objectiveIndex: number | null;
  moneyDay: MoneyDay | null;
  moneyDayRefused: Refusal | null; // a money day was asked for and cannot run — and why
  orders: string[]; // the marching orders, in plain words
}

export const getPlanStatus = (
  snapshot: SnapshotInput | null,
  plan: PlanInput | null,
  // accrualMoved: the balances typed already hold the accrual — Jason moves it
  // BEFORE he types the snapshot (2026-11-04) — so it is shown, not subtracted.
  ctx: { accrual?: AccrualInput | null; moneyDay?: MoneyDayInput | null; accrualMoved?: boolean } = {},
): PlanStatus | null => {
  if (!snapshot || !plan) return null;
  const perMile = num(plan.maintenance_per_mile);
  const accIn = ctx.accrual ?? null;
  const accDue = accIn ? getAccrual(accIn.miles, perMile) : null;
  // What still has to leave Ops: nothing when no week is owed or the move is
  // already in the balances (a true $0) — but an owed accrual whose miles or
  // rate isn't set is UNKNOWN (null), never $0.
  const accrualOwed = accIn != null && !ctx.accrualMoved;
  const acc: number | null = accrualOwed ? accDue : 0;
  const accMissing: MissingInput[] = [];
  if (accIn && accrualOwed && accDue == null) {
    if (num(accIn.miles) == null) accMissing.push(WORDS.miles);
    if (perMile == null) accMissing.push(WORDS.per_mile);
  }
  const accrualFlag = accrualFlagOf(ctx.accrual);

  const waterfall = getWaterfallStage(snapshot, plan.stages);
  const objectiveIndex = objectiveIndexOf(waterfall, plan.stages);
  const objectiveLabel = objectiveIndex != null && waterfall ? waterfall.stages[objectiveIndex].stage.label : null;

  const vaultStages = [...plan.stages].filter((s) => s.kind === "vault").sort((a, b) => a.position - b.position);
  const cushion = getCushionProgress(
    snapshot.vault,
    vaultStages[0]?.target_lo ?? null,
    vaultStages[vaultStages.length - 1]?.target_lo ?? null,
  );

  const { moneyDay, refused: moneyDayRefused } = runMoneyDay(
    snapshot, plan, ctx.moneyDay ?? null, acc, objectiveLabel, accMissing,
  );

  const ops = num(snapshot.ops);
  const floatLine = num(plan.float_line);
  const maint = num(snapshot.maintenance);
  const vault = num(snapshot.vault);
  const mFloor = num(plan.maintenance_floor);
  const vFloor = vaultFloorOf(plan.stages);
  const vFloorWords = vaultFloorMissing(plan.stages);
  const opsAfter = moneyDay ? moneyDay.opsAfter : ops == null || acc == null ? null : ops - acc;
  const interlock = moneyDay
    ? moneyDay.interlock
    : getInterlock(
        { opsAfter, maintenanceAfter: maint == null || acc == null ? null : maint + acc, vault },
        { ops: floatLine, maintenance: mFloor, vault: vFloor },
        0,
        { blame: { ops: ops != null && acc == null ? accMissing : undefined, maintenance: maint != null && acc == null ? accMissing : undefined }, vaultFloor: vFloorWords },
      );

  // The verdict reads where the balances stand after the accrual, before any
  // fill: under the float → HOLD; float held but a reserve under its floor →
  // FLOORS FIRST; every floor holds → ON PLAN. A verdict that needs an input
  // that isn't set WAITS on it (waitingOn) — a missing balance is never $0.
  // Under the float is certain even with the accrual unknown (it only lowers Ops).
  let verdict: PlanStatus["verdict"] = null;
  const waiting: MissingInput[] = [];
  if (ops == null) waiting.push(WORDS.ops);
  if (floatLine == null) waiting.push(WORDS.float_line);
  if (ops != null && floatLine != null) {
    if (ops < floatLine || (opsAfter != null && opsAfter < floatLine)) verdict = "below-float";
    else if (acc == null) waiting.push(...accMissing);
    else {
      const mOk = mFloor == null || maint == null ? null : maint + acc >= mFloor;
      const vOk = vFloor == null || vault == null ? null : vault >= vFloor;
      if (mOk === false || vOk === false) verdict = "floors-first";
      else if (mOk === null || vOk === null) {
        if (mFloor == null) waiting.push(WORDS.maintenance_floor);
        if (maint == null) waiting.push(WORDS.maintenance);
        if (vFloor == null) waiting.push(vFloorWords);
        if (vault == null) waiting.push(WORDS.vault);
      } else verdict = "on-plan";
    }
  }

  const orders: string[] = [];
  const accMiles = accIn ? num(accIn.miles) : null;
  if (accDue != null && ctx.accrual && accMiles != null && perMile != null) {
    const cu = ctx.accrual.catchUpMiles ?? 0;
    const reTrued = cu !== 0 ? ` · incl. ${cu > 0 ? "+" : "−"}${miles(Math.abs(cu))} mi re-trued, ${ctx.accrual.catchUpLabel ?? "closed weeks"}` : "";
    orders.push(
      ctx.accrualMoved
        ? `Maintenance accrual ${money(accDue)} (${miles(accMiles)} mi × $${perMile}${reTrued}) — already moved, the balances show it`
        : `Accrue Maintenance ${money(accDue)} (${miles(accMiles)} mi × $${perMile}${reTrued})`,
    );
  }
  if (moneyDay) {
    const il = moneyDay.interlock;
    orders.push(
      `Tax ${money(moneyDay.tax)} (${moneyDay.monthLabel}: ${moneyDay.pretaxProfit < 0 ? "a loss" : `${moneyDay.taxPct} % of ${money(moneyDay.pretaxProfit)}`})`,
    );
    if (il.heldBy === "ops") {
      orders.push(`Surplus $0 — held by the operating floor, short ${moneyOr(il.floors[0].short, "unknown")}`);
    } else if (moneyDay.belowMin) {
      orders.push(`Surplus ${money(moneyDay.surplus)} — under the ${money(moneyDay.minMove)} minimum, nothing moves`);
    } else {
      for (const f of il.floors) {
        if (f.fill > 0) orders.push(`${f.key === "vault" ? "Vault" : "Maintenance"} ${money(f.fill)} (floor ${f.key === "maintenance" ? 2 : 3})`);
      }
      if (il.heldBy !== null) {
        const held = il.floors.find((f) => f.key === il.heldBy)!;
        orders.push(`held by the ${held.label} floor, short ${moneyOr(held.short, "unknown")}`);
      } else if (il.remainder > 0) {
        orders.push(`${objectiveLabel ?? "Objective"} ${money(moneyDay.objective)} · Household ${money(moneyDay.household)}`);
      } else {
        orders.push("Surplus $0 — nothing to split");
      }
    }
  } else {
    if (moneyDayRefused && ctx.moneyDay)
      orders.push(`${monthName(ctx.moneyDay.month).split(" ")[0]}'s money day can't run — ${missingWords(moneyDayRefused.missing)}`);
    if (verdict === "below-float") orders.push("Below the float — hold");
  }
  const act = waterfall?.activeIndex != null ? waterfall.stages[waterfall.activeIndex] : null;
  if (act && act.overflow != null && act.overflow > 0) {
    orders.push(`${money(act.overflow)} above the ratchet — send it to ${act.stage.label}`);
  }

  return {
    accrual: accDue, accrualFlag, opsAfter, verdict, waitingOn: dedupe(waiting), interlock, cushion, waterfall,
    objectiveIndex, moneyDay, moneyDayRefused, orders,
  };
};

// ---- the guards that were words (Nod Sheet 2026-11-04, §4 · 5) ----

// A filed month as the page reads it off the Expenses P&L.
export interface FiledMonth {
  month: string; // YYYY-MM-01
  pretax: number;
  income: number;
  cogs: number;
  expenses: number;
}

// The money day's queue: every filed month under the rules that nobody has
// settled, oldest first — and never the month still running. A P&L posted
// mid-month (a partial month) used to open a money day on it; a month can
// only settle once it has closed.
export const moneyDayQueue = (
  filed: FiledMonth[],
  settled: Set<string>,
  firstMoneyMonth: string,
  today: string, // the operator's local day key
): MoneyDayInput[] => {
  const running = `${String(today).slice(0, 7)}-01`;
  return [...filed]
    .filter((f) => f.month >= firstMoneyMonth && f.month < running && !settled.has(f.month))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((f) => ({ month: f.month, pretaxProfit: f.pretax, income: f.income, cogs: f.cogs, expenses: f.expenses }));
};

// The verdict names its basis (PL-04): the same stamp used to read one way
// with a money day pending and another without, and said neither. "on the
// Nov 1 snapshot · after the $878 accrual · October's tax $0".
export const verdictBasis = (
  st: PlanStatus,
  opts: { opsWords: string; accrualMoved?: boolean },
): string => {
  const parts = [`on ${opts.opsWords}`];
  if (st.accrual != null && st.accrual > 0)
    parts.push(opts.accrualMoved ? `the ${money(st.accrual)} accrual already in it` : `after the ${money(st.accrual)} accrual`);
  if (st.moneyDay) parts.push(`${st.moneyDay.monthLabel.split(" ")[0]}'s tax ${money(st.moneyDay.tax)}`);
  return parts.join(" · ");
};
