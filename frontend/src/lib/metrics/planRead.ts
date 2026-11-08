// ONE read of the plan's standing (Cockpit PR 1): the Plan page and the owner's
// landing page both build `status` here, so the floors and the stage on Pulse
// are the Plan page's own figures. Lifted whole from StatusPage — the
// arithmetic is unchanged; the page keeps its edit/draft flows and their own
// getPlanStatus calls (money-day preview, the form's draft).
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { Obligation } from "@/types/obligation";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceService } from "@/types/maintenance";
import type { PlanRow, AccountRow, SnapshotRow, OpsCheckRow } from "@/services/planService";
import {
  getPlanStatus,
  type PlanStageInput,
  type PlanInput,
  type SnapshotInput,
  type AccrualInput,
  type PlanStatus,
} from "./planStatus";
import { weeksOwed, milesInWeeks, weekLabel } from "./payWeeks";
import { collectReadings, weekOdometerMiles, readingWords, IMPLAUSIBLE_WEEK_MI } from "./odometer";
import { retrueAccrued } from "./accrualTruth";

export const dayOf = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Snapshots in the order they were typed: by day, then by the clock — two on
// one day used to make "latest" arbitrary (2026-11-04).
export const byTyped = (x: SnapshotRow, y: SnapshotRow): number => {
  const a = dayOf(x.as_of);
  const b = dayOf(y.as_of);
  if (a !== b) return a < b ? -1 : 1;
  const ca = String(x.created_at ?? "");
  const cb = String(y.created_at ?? "");
  return ca < cb ? -1 : ca > cb ? 1 : 0;
};

// A pay week's miles are the reading at its end minus the reading at its
// start — every mile the truck rolled, loaded or not. The loads' figure
// rides along so the two can be watched agreeing, and stands in when no
// reading predates the week. An OPEN week (only when the form is back-dated
// inside it) takes the larger of the two, since both are still growing.
export const owedFor = (asOf: string, lastAccrued: string | null, loads: Load[], readings: ReturnType<typeof collectReadings>) => {
  const { weeks, truncated } = weeksOwed(asOf, lastAccrued);
  const m = milesInWeeks(loads, weeks);
  const label =
    weeks.length === 0
      ? ""
      : weeks.length === 1
        ? weekLabel(weeks[0])
        : weekLabel({ start: weeks[0].start, end: weeks[weeks.length - 1].end });

  let odoTotal = 0;
  let prefill = 0;
  let gap = false; // a week with no reading before it — the whole accrual falls back
  let endSlips = false;
  let backwards = 0;
  // The mirror typo: a reading fat-fingered too HIGH never goes backwards,
  // so it lands as an impossible week instead of a flagged entry.
  let implausible: number | null = null;
  let endDate: string | null = null;
  const words: string[] = [];
  for (const w of weeks) {
    const closed = w.end < dayOf(asOf);
    const o = closed ? weekOdometerMiles(readings, w) : weekOdometerMiles(readings, w, dayOf(asOf));
    const loadsMi = milesInWeeks(loads, [w]).miles;
    backwards += o.backwards.length;
    if (o.miles == null) {
      gap = true;
      prefill += loadsMi;
      continue;
    }
    odoTotal += o.miles;
    if (o.miles > IMPLAUSIBLE_WEEK_MI && o.miles > (implausible ?? 0)) implausible = o.miles;
    prefill += closed ? o.miles : Math.max(o.miles, loadsMi);
    if (o.start && o.end) words.push(`${readingWords(o.start)} → ${readingWords(o.end)}`);
    if (o.endSlips) {
      endSlips = true;
      endDate = o.end?.date ?? null;
    }
  }
  const source: "odometer" | "loads" = gap ? "loads" : "odometer";
  return {
    weeks,
    truncated,
    label,
    loads: m.loads,
    loadedMiles: m.loadedMiles,
    deadheadMiles: m.deadheadMiles,
    noDeadhead: m.noDeadhead,
    loadsMiles: m.miles,
    loadedMissing: m.loadedMissing,
    // The pre-fill: the odometer's miles, or the loads' when a week has no
    // reading before it. Never a fake zero — an empty week is 0 miles.
    miles: gap ? m.miles : prefill,
    source,
    odometerMiles: gap ? null : odoTotal,
    readingsWords: gap || words.length === 0 ? null : words.join(" · "),
    endSlips: gap ? false : endSlips,
    endDate: gap ? null : endDate,
    backwards,
    implausibleMiles: implausible,
  };
};
export type Owed = ReturnType<typeof owedFor>;

// A week with no odometer reading AND no loads (or loads missing their loaded
// miles) has no miles to speak of — unknown, so the accrual refuses (PLAN-06).
export const milesKnown = (o: Owed): boolean => !(o.source === "loads" && (o.loads === 0 || o.loadedMissing.length > 0));

export interface PlanReadParts {
  today: string; // the operator's LOCAL day key
  plans: PlanRow[];
  accounts: AccountRow[];
  snapshots: SnapshotRow[];
  opsChecks: OpsCheckRow[];
  obligations: Obligation[];
  loads: Load[];
  fuelEntries: FuelEntry[];
  trips: Trip[];
  services: MaintenanceService[];
}

export const readPlanStatus = (parts: PlanReadParts) => {
  const { today, plans, accounts, opsChecks, obligations, loads, fuelEntries, trips, services } = parts;
  const snapshots = [...parts.snapshots].sort(byTyped);
  const plan = plans.find((p) => p.active) ?? plans[0] ?? null;
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  // The Ops number this page measures from: the latest snapshot — or an OPS NOW
  // check typed after it, the same rule the cash board uses (2026-11-04; the
  // two pages used to open on different numbers).
  const newestCheck =
    [...opsChecks]
      .sort((x, y) => (x.as_of < y.as_of ? -1 : x.as_of > y.as_of ? 1 : String(x.created_at ?? "") < String(y.created_at ?? "") ? -1 : 1))
      .at(-1) ?? null;
  const opsFromCheck = latest && newestCheck && newestCheck.as_of.slice(0, 10) > latest.as_of.slice(0, 10) ? newestCheck : null;

  // Role resolution — the math reads four roles; anything else is watched.
  const activeAccounts = accounts.filter((a) => a.active).sort((a, b) => a.position - b.position);
  const opsAcct = activeAccounts.find((a) => a.role === "ops") ?? null;
  const vaultAcct = activeAccounts.find((a) => a.role === "vault") ?? null;
  const maintAcct = activeAccounts.find((a) => a.role === "maintenance") ?? null;
  const taxAcct = activeAccounts.find((a) => a.role === "tax") ?? null;
  const otherReserves = activeAccounts.filter((a) => a.role === "reserve");
  const balanceOf = (sn: SnapshotRow | null, accountId: string | null | undefined): number | null => {
    if (!sn || !accountId) return null;
    const b = sn.balances.find((x) => x.account_id === accountId);
    return b == null ? null : Number(b.balance);
  };
  const obligById = new Map(obligations.map((o) => [o.obligation_id, o]));

  const stageInputs: PlanStageInput[] = (plan?.stages ?? []).map((s) => ({
    stage_id: s.stage_id,
    position: s.position,
    label: s.label,
    kind: s.kind,
    target_lo: s.target_lo,
    target_hi: s.target_hi,
    obligation: s.obligation_id
      ? {
          current_balance: num(obligById.get(s.obligation_id)?.current_balance ?? null),
          original_balance: num(obligById.get(s.obligation_id)?.original_balance ?? null),
        }
      : null,
  }));

  const planInput: PlanInput | null = plan
    ? {
        float_line: plan.float_line,
        stages: stageInputs,
        maintenance_per_mile: plan.maintenance_per_mile,
        tax_pct: plan.tax_pct,
        maintenance_floor: plan.maintenance_floor,
        min_move: plan.min_move,
        objective_pct: plan.objective_pct,
      }
    : null;

  const snapInput = (sn: SnapshotRow | null): SnapshotInput | null =>
    sn
      ? {
          as_of: sn === latest && opsFromCheck ? opsFromCheck.as_of : sn.as_of,
          ops: sn === latest && opsFromCheck ? Number(opsFromCheck.balance) : balanceOf(sn, opsAcct?.account_id),
          vault: balanceOf(sn, vaultAcct?.account_id),
          maintenance: balanceOf(sn, maintAcct?.account_id),
          tax: balanceOf(sn, taxAcct?.account_id),
        }
      : null;

  // ---- the accrual's clock: which closed pay weeks a snapshot on `asOf` owes ----
  const lastAccrued = snapshots.reduce<string | null>((m, s) => {
    const w = s.pay_week_start ? dayOf(s.pay_week_start) : null;
    return w && (!m || w > m) ? w : m;
  }, null);
  const lastAccrual = lastAccrued ? snapshots.find((s) => dayOf(s.pay_week_start) === lastAccrued) ?? null : null;
  // The odometer chain: every reading dash holds — a fill, a load's pickup and
  // delivery, each end of a trip log, a shop visit's meter.
  const readings = collectReadings(fuelEntries, loads, trips, services);
  // Closed weeks re-true (call 8, 2026-11-04): every week that already
  // accrued, re-read from the chain today, net of the miles the snapshots
  // moved. The difference is a catch-up that rides into the next accrual, once.
  const retrue = retrueAccrued(snapshots, readings, loads, today);
  const catchUpMiles = retrue?.deltaMiles ?? 0;

  const owedForAsOf = (asOf: string): Owed => owedFor(asOf, lastAccrued, loads, readings);
  const accrualInput = (o: Owed, miles: string | number | null): AccrualInput | null =>
    o.weeks.length === 0
      ? null
      : {
          miles,
          weekLabel: o.label,
          loads: o.loads,
          loadedMiles: o.loadedMiles,
          deadheadMiles: o.deadheadMiles,
          noDeadhead: o.noDeadhead,
          source: o.source,
          odometerMiles: o.odometerMiles,
          loadsMiles: o.loadsMiles,
          readingsWords: o.readingsWords,
          endSlips: o.endSlips,
          backwards: o.backwards,
          implausibleMiles: o.implausibleMiles,
          catchUpMiles: catchUpMiles || null,
          catchUpLabel: retrue?.label ?? null,
        };
  const owedToday = owedForAsOf(today);
  // What this Friday's accrual runs on: the owed week(s) plus the catch-up
  // (never below zero — an over-accrual nets off and the rest waits).
  const owedTodayMiles = owedToday.weeks.length && milesKnown(owedToday) ? Math.max(0, owedToday.miles + catchUpMiles) : null;

  // Jason moves the Friday accrual BEFORE he types the snapshot: when the
  // latest snapshot's Maintenance balance already rose by the accrual that is
  // due, the move is inside the balances and must not come off Ops again.
  const accrualMoved = (() => {
    if (!latest || !previous || !plan) return false;
    if (owedTodayMiles == null) return false; // miles unknown: nothing to compare the rise against
    const due = owedTodayMiles * Number(plan.maintenance_per_mile);
    if (!(due > 0)) return false;
    const now = balanceOf(latest, maintAcct?.account_id);
    const before = balanceOf(previous, maintAcct?.account_id);
    if (now == null || before == null) return false;
    return now - before >= 0.9 * due;
  })();
  // EXACTLY the Plan page's standing read (not the money-day draft variants).
  const status: PlanStatus | null = planInput
    ? getPlanStatus(snapInput(latest), planInput, { accrual: accrualInput(owedToday, owedTodayMiles), accrualMoved })
    : null;

  return {
    snapshots, plan, latest, previous, newestCheck, opsFromCheck,
    activeAccounts, opsAcct, vaultAcct, maintAcct, taxAcct, otherReserves, balanceOf,
    obligById, stageInputs, planInput, snapInput,
    lastAccrued, lastAccrual, readings, retrue, catchUpMiles,
    owedFor: owedForAsOf, accrualInput, owedToday, owedTodayMiles, accrualMoved, status,
  };
};
