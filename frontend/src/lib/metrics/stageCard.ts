// What the landing page's "The stage" and "The floors" cards say, as data
// (Cockpit PR 1). Everything here reads the Plan page's own status
// (readPlanStatus → getPlanStatus), so the card and the Plan page can't
// disagree; a missing input is named, never a zero.
import type { PlanRow } from "@/services/planService";
import type { Obligation } from "@/types/obligation";
import { FIX_PLAN, FIX_SNAPSHOT, type PlanStatus, type FloorStatus } from "./planStatus";
import { computePayoff, isPayoffTracked } from "./payoff";
import type { MissingInput } from "@/lib/integrity/require";

const PLAN_PAGE = "/status";
const link = (key: string, label: string, fixAt: string): MissingInput => ({ key, label, fixAt, fixTo: PLAN_PAGE });

// ---- payoff: a date, or the reason there isn't one ----

export const NO_AS_OF_REASON = "the balance has no as-of date — set it on the Plan page";
export const NO_PAYMENT_REASON = "the loan has no monthly payment or end date — set it on the Expenses page";

export type PayoffRead =
  | { ok: true; date: string; exact: boolean; paidOff: boolean }
  | { ok: false; reason: string };

export const payoffRead = (o: Obligation, now: Date): PayoffRead => {
  // A statement balance without the day it was read can't be walked forward.
  if (o.balance_as_of == null) return { ok: false, reason: NO_AS_OF_REASON };
  const p = computePayoff(o, now);
  if (p.isPaidOff) return { ok: true, date: now.toISOString().slice(0, 10), exact: true, paidOff: true };
  if (p.payoffDate == null) return { ok: false, reason: NO_PAYMENT_REASON };
  return { ok: true, date: p.payoffDate, exact: p.exact, paidOff: false };
};

// "Mar 2031" — a day key printed as its own month, never shifted by the zone.
export const monthYear = (k: string): string =>
  new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export type TruckFree =
  | { ok: true; text: string }
  | { ok: false; text: string };

// "truck free and clear ≈ Mar 2031" from the loan tracked against the truck —
// the same obligation and the same computePayoff the Fleet pages read.
export const truckFreeAndClear = (obligations: Obligation[], now: Date): TruckFree => {
  const o = obligations.find((x) => x.asset_type === "truck" && isPayoffTracked(x));
  if (!o) return { ok: false, text: "truck free and clear: unknown — no loan is tracked against the truck; add its balance on the Expenses page" };
  const r = payoffRead(o, now);
  if (!r.ok) return { ok: false, text: `truck free and clear: unknown — ${r.reason}` };
  if (r.paidOff) return { ok: true, text: "truck is free and clear" };
  return { ok: true, text: `truck free and clear ≈ ${monthYear(r.date)}` };
};

// ---- the stage ----

export type StageView =
  | { kind: "refused"; what: string; missing: MissingInput[] } // nothing to place the stage on
  | { kind: "complete"; total: number } // every stage done
  | {
      kind: "obligation";
      n: number; total: number; label: string;
      left: number | null; // the bound balance (current_balance), null = unbound
      asOf: string | null;
      draft: number | null; // draft_amount, else the monthly amount
      payoff: PayoffRead | null;
    }
  | { kind: "balance"; n: number; total: number; label: string; stageKind: "vault" | "trailer"; current: number | null; target: number | null };

export const stageView = (
  status: PlanStatus | null,
  plan: PlanRow | null,
  obligById: Map<string, Obligation> | null,
  now: Date,
): StageView => {
  if (!plan) return { kind: "refused", what: "place the stage", missing: [link("plan", "the plan", FIX_PLAN)] };
  const wf = status?.waterfall ?? null;
  if (!wf) {
    return {
      kind: "refused", what: "place the stage",
      missing: [link("balance_vault", "the Vault balance", FIX_SNAPSHOT)],
    };
  }
  const total = wf.stages.length;
  if (wf.activeIndex == null) {
    // The walk stopped at a rung with no target, or the finish line is crossed.
    if (wf.refusedAt != null) return { kind: "refused", what: "place the stage", missing: wf.stages[wf.refusedAt].missing };
    return { kind: "complete", total };
  }
  const st = wf.stages[wf.activeIndex];
  const n = wf.activeIndex + 1;
  const label = st.stage.label;
  if (st.stage.kind === "obligation") {
    const planStage = plan.stages.find((s) => s.stage_id === st.stage.stage_id);
    const o = planStage?.obligation_id ? obligById?.get(planStage.obligation_id) ?? null : null;
    const draft = o ? (o.draft_amount ?? o.amount ?? null) : null;
    return {
      kind: "obligation", n, total, label,
      left: st.currentValue,
      asOf: o?.balance_as_of ? String(o.balance_as_of).slice(0, 10) : null,
      draft: draft != null && Number.isFinite(Number(draft)) ? Number(draft) : null,
      payoff: o ? payoffRead(o, now) : null,
    };
  }
  const t = st.stage.target_lo;
  return {
    kind: "balance", n, total, label, stageKind: st.stage.kind,
    current: st.currentValue,
    target: t == null || t === "" || !Number.isFinite(Number(t)) ? null : Number(t),
  };
};

// ---- the floors ----

export interface FloorView {
  key: FloorStatus["key"];
  label: string;
  balance: number | null;
  floor: number | null;
  pct: number | null; // 0–100, capped; null when either side is unknown
  met: boolean | null;
  missing: MissingInput[];
}

export const floorViews = (status: PlanStatus | null): FloorView[] | null => {
  const il = status?.interlock ?? null;
  if (!il) return null;
  return il.floors.map((f) => ({
    key: f.key,
    label: f.label,
    balance: f.balance,
    floor: f.floor,
    pct: f.balance != null && f.floor != null && f.floor > 0 ? Math.min(100, Math.max(0, Math.round((f.balance / f.floor) * 100))) : null,
    met: f.met,
    missing: f.missing,
  }));
};
