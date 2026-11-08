import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPlans,
  createPlan,
  patchPlan,
  createStage,
  patchStage,
  deleteStage,
  getAccounts,
  createAccount,
  patchAccount,
  getSnapshots,
  createSnapshot,
  getOpsChecks,
  type OpsCheckRow,
  type PlanRow,
  type PlanStageRow,
  type SnapshotRow,
  type AccountRow,
} from "@/services/planService";
import { getObligations } from "@/services/obligationsService";
import { getExpensePeriods } from "@/services/expensesService";
import { getLoads } from "@/services/loadsService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import type { MaintenanceService } from "@/types/maintenance";
import type { Obligation } from "@/types/obligation";
import type { ExpensePeriod } from "@/types/expense";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import {
  getPlanStatus,
  getTaxMove,
  moneyDayQueue,
  verdictBasis,
  monthName,
  money as fmtMoney,
  FIX_SNAPSHOT,
  type SnapshotInput,
  type MoneyDayInput,
  type FloorStatus,
} from "@/lib/metrics/planStatus";
import { weekLabel, payWeekOf, isFirstFriday } from "@/lib/metrics/payWeeks";
import { retrueWords } from "@/lib/metrics/accrualTruth";
import { money, formatDate } from "@/lib/format";
import { readPlanStatus, byTyped, milesKnown } from "@/lib/metrics/planRead";
import { MissingInputLine } from "@/components/integrity/MissingInput";
import { missingWords, type MissingInput } from "@/lib/integrity/require";

// The Plan page (ADMIN-03, #500). Two beats. THE FRIDAY: snapshot first —
// raw balances in — then the accrual out (the pay week's mileage × $/mile →
// Maintenance). THE MONEY DAY: opens when the month's P&L is filed, runs any
// day, never the first Friday: tax off the top → the interlock (three floors
// in order Ops → Maintenance → Vault) → the surplus → the split. dash hands
// out the orders and renders the seven-line entry; the log is Excel's. The
// plan is a framework: stages/targets are rows, 2028 is a new plan.

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const todayKey = () => new Date().toLocaleDateString("en-CA");
const day = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);
const round2 = (n: number): number => Math.round(n * 100) / 100;
// "Sep 27" — a reading's day, UTC-safe (dates are the #1 bug).
const dayWords = (v: string): string =>
  new Date(`${day(v)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// 'YYYY-MM-01' one month on.
const nextMonth = (ymd: string): string => {
  const [y, m] = day(ymd).split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
};

const Cells = ({
  pct,
  cells = 12,
  dim = false,
  hot = false,
}: {
  pct: number;
  cells?: number;
  dim?: boolean;
  hot?: boolean;
}) => (
  <div className="flex gap-[3px]">
    {Array.from({ length: cells }, (_, i) => {
      const on = (i + 1) / cells <= pct + 1e-6;
      return (
        <i
          key={i}
          className="flex-1 h-[9px] rounded-[2px]"
          style={
            on
              ? {
                  background: hot
                    ? "linear-gradient(180deg, color-mix(in srgb, var(--color-status-negative-text) 70%, transparent), var(--color-status-negative-text))"
                    : "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                  border: "1px solid color-mix(in srgb, var(--color-amber-hi) 50%, transparent)",
                  opacity: dim ? 0.35 : 1,
                }
              : {
                  background: "var(--color-well)",
                  border: "1px solid var(--color-hairline-lo)",
                  boxShadow: "var(--shadow-inset)",
                }
          }
        />
      );
    })}
  </div>
);

// The little rotated stamps: FLOOR 3 · CURRENT OBJECTIVE · HELD · MET · NEXT.
const Stamp = ({ tone, children }: { tone: "amber" | "dim" | "pos"; children: string }) => (
  <span
    className="font-forge text-[10.5px] tracking-[.12em] rounded-[4px] px-[6px] py-[1px] ml-2 inline-block rotate-[-2deg] align-middle"
    style={
      tone === "amber"
        ? { color: "var(--color-amber-hi)", border: "1.5px solid var(--color-amber-hi)" }
        : tone === "pos"
          ? { color: "var(--color-status-positive-text)", border: "1.5px solid var(--color-status-positive-text)" }
          : { color: "var(--color-faint)", border: "1.5px dashed var(--color-hairline)" }
    }
  >
    {children}
  </span>
);

const Ring = ({ state, children }: { state: "done" | "act" | "pend"; children: number }) => (
  <span
    className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-display text-[15px] shrink-0"
    style={
      state === "done"
        ? { background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))", color: "var(--color-canvas)" }
        : state === "act"
          ? { border: "2px solid var(--color-amber-hi)", color: "var(--color-amber-hi)" }
          : { border: "2px dashed var(--color-hairline)", color: "var(--color-faint)" }
    }
  >
    {children}
  </span>
);

const FIELD =
  "h-9 w-full rounded-[9px] bg-well border border-hairline px-3 font-condensed text-[14px] text-ink outline-none";
const LBL = "font-condensed font-semibold text-[11px] tracking-[.12em] uppercase text-faint mb-1 block";
const BOARD_HEAD = "flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule";
const BOARD_TITLE = "font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint";
const BOARD_SUB = "font-condensed text-[12px] text-faint";

const StatusPage = () => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [opsChecks, setOpsChecks] = useState<OpsCheckRow[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSnap, setShowSnap] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      getPlans(),
      getAccounts(),
      getSnapshots(),
      getObligations(),
      getExpensePeriods(),
      getLoads(),
      // The odometer chain is a nice-to-have on this page: if fuel or trips
      // fail the accrual falls back to the loads, it doesn't blank the Plan.
      getFuelEntries().catch((): FuelEntry[] => []),
      getTrips().catch((): Trip[] => []),
      // OPS NOW checks: the board's Ops number when one is newer than the snapshot.
      getOpsChecks().catch((): OpsCheckRow[] => []),
    ])
      .then(([p, a, s, o, pe, l, f, t, oc]) => {
        setPlans(p);
        setAccounts(a);
        setSnapshots([...s].sort(byTyped));
        setOpsChecks(oc);
        setObligations(o);
        setPeriods(pe);
        setLoads(l);
        setFuelEntries(f);
        setTrips(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // The standing read — plan, floors, accrual clock — is built by the ONE
  // function the landing page also calls (lib/metrics/planRead.ts).
  const [services, setServices] = useState<MaintenanceService[]>([]);
  useEffect(() => {
    getMaintenanceServices().then(setServices).catch(() => {});
  }, []);
  const read = useMemo(
    () => readPlanStatus({ today: todayKey(), plans, accounts, snapshots, opsChecks, obligations, loads, fuelEntries, trips, services }),
    [plans, accounts, snapshots, opsChecks, obligations, loads, fuelEntries, trips, services],
  );
  const {
    plan, latest, opsFromCheck, activeAccounts, opsAcct, vaultAcct, maintAcct, taxAcct, otherReserves, balanceOf,
    stageInputs, planInput, snapInput, lastAccrued, lastAccrual, readings, retrue, catchUpMiles, owedFor,
    accrualInput, owedToday, owedTodayMiles, accrualMoved, status,
  } = read;

  // ---- the money day's clock: the earliest filed month nobody has settled ----
  const filed = useMemo(
    () =>
      periods
        .filter((p) => p.income_total != null && p.cogs_total != null && p.expense_total != null)
        .map((p) => ({
          month: day(p.period_month),
          pretax: p.income_total! - p.cogs_total! - p.expense_total!,
          income: p.income_total!,
          cogs: p.cogs_total!,
          expenses: p.expense_total!,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periods],
  );
  const settled = useMemo(
    () => new Set<string>(snapshots.flatMap((s) => (s.settles_month ? [day(s.settles_month)] : []))),
    [snapshots],
  );
  const firstMoneyMonth = plan ? day(plan.first_money_month) || "2026-08-01" : "2026-08-01";
  // Every CLOSED filed month nobody has settled, oldest first — the money day
  // runs them in order; the first is open, the rest wait behind it. A P&L
  // posted mid-month waits for the calendar (2026-11-04).
  const queue: MoneyDayInput[] = useMemo(
    () => moneyDayQueue(filed, settled, firstMoneyMonth, todayKey()),
    [filed, settled, firstMoneyMonth],
  );
  const pending: MoneyDayInput | null = queue[0] ?? null;
  // The month before the open one, for the Tax row's context clause.
  const prevFiled = useMemo(() => {
    if (!pending) return null;
    const i = filed.findIndex((f) => f.month === pending.month);
    return i > 0 ? filed[i - 1] : null;
  }, [filed, pending]);
  const latestFiled = filed.length ? filed[filed.length - 1].month : null;
  const opensNext = latestFiled ? monthName(nextMonth(latestFiled)) : null;

  // The money day panel previews the pending month on the latest balances.
  const preview = useMemo(
    () =>
      planInput && pending
        ? getPlanStatus(snapInput(latest), planInput, { accrual: accrualInput(owedToday, owedTodayMiles), moneyDay: pending, accrualMoved })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planInput, latest, opsFromCheck, owedToday, accrualMoved, pending, opsAcct, vaultAcct, maintAcct, taxAcct],
  );

  // When a money day is open the whole page previews it — the badge, the
  // cards, the interlock's fills — so the panel and the board never disagree.
  const view = preview ?? status;

  const trend = useMemo(
    () =>
      snapshots.map((s) => ({
        week: formatDate(s.as_of) ?? s.as_of,
        ops: balanceOf(s, opsAcct?.account_id), // null = no balance typed: a gap in the line, never $0
        vault: balanceOf(s, vaultAcct?.account_id),
      })),
    [snapshots, opsAcct, vaultAcct, balanceOf],
  );

  // ---- snapshot form (the Friday, or the money day with the month ticked) ----
  const [fAsOf, setFAsOf] = useState(todayKey());
  const [fBalances, setFBalances] = useState<Record<string, string>>({});
  const [fNote, setFNote] = useState("");
  const [fMiles, setFMiles] = useState("");
  const [fMoneyDay, setFMoneyDay] = useState(false);
  const [copied, setCopied] = useState(false);
  // The guards that were words (2026-11-04): a snapshot is dated today or
  // earlier, and the money day never runs on the month's first Friday. The
  // server holds the same two lines.
  const asOfFuture = fAsOf > todayKey();
  const firstFriday = isFirstFriday(fAsOf);
  const formMoneyDay = fMoneyDay && !firstFriday && !!pending;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const owedForm = useMemo(() => owedFor(fAsOf), [fAsOf, loads, readings, lastAccrued]);

  const openSnapshot = (moneyDay: boolean) => {
    const today = todayKey();
    const o = owedFor(today);
    setFAsOf(today);
    setFBalances({});
    setFNote("");
    setFMiles(o.weeks.length && milesKnown(o) ? String(Math.max(0, o.miles + catchUpMiles)) : "");
    setFMoneyDay(moneyDay && !!pending);
    setError(null);
    setCopied(false);
    setShowSnap(true);
  };
  const changeAsOf = (v: string) => {
    setFAsOf(v);
    if (v) {
      const o = owedFor(v);
      setFMiles(o.weeks.length && milesKnown(o) ? String(Math.max(0, o.miles + catchUpMiles)) : "");
    }
  };

  const draftStatus = useMemo(() => {
    if (!planInput) return null;
    const draft: SnapshotInput = {
      ops: opsAcct ? fBalances[opsAcct.account_id] || null : null,
      vault: vaultAcct ? fBalances[vaultAcct.account_id] || null : null,
      maintenance: maintAcct ? fBalances[maintAcct.account_id] || null : null,
      tax: taxAcct ? fBalances[taxAcct.account_id] || null : null,
    };
    return getPlanStatus(draft, planInput, {
      accrual: accrualInput(owedForm, fMiles),
      moneyDay: formMoneyDay && pending ? pending : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planInput, fBalances, fMiles, fMoneyDay, pending, owedForm, opsAcct, vaultAcct, maintAcct, taxAcct]);

  const saveSnapshot = async () => {
    if (formMoneyDay && draftStatus?.moneyDayRefused) {
      setError(`Can't run the money day — ${missingWords(draftStatus.moneyDayRefused.missing)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accrues = owedForm.weeks.length > 0 && fMiles.trim() !== "";
      // What the money day moved rides with the snapshot (085) — the record
      // the pages read back, never a P&L that may be edited later.
      const md = formMoneyDay ? draftStatus?.moneyDay ?? null : null;
      await createSnapshot({
        as_of: fAsOf,
        note: fNote.trim() || null,
        balances: activeAccounts.map((a) => ({
          account_id: a.account_id,
          balance: Number(fBalances[a.account_id]), // the button is disabled until every balance is typed
        })),
        miles: accrues ? Number(fMiles) : null,
        pay_week_start: accrues ? owedForm.weeks[owedForm.weeks.length - 1].start : null,
        settles_month: formMoneyDay && pending ? pending.month : null,
        tax_moved: md ? round2(md.tax) : null,
        surplus_moved: md ? round2(md.belowMin ? 0 : md.surplus) : null,
        objective_moved: md ? md.objective : null,
        household_moved: md ? md.household : null,
      });
      setShowSnap(false);
      setFBalances({});
      setFNote("");
      setFMiles("");
      setFMoneyDay(false);
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Could not save the snapshot",
      );
    } finally {
      setBusy(false);
    }
  };

  const copyEntry = async () => {
    const lines = draftStatus?.moneyDay?.entry;
    if (!lines) return;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy — select the entry and copy it by hand");
    }
  };

  // ---- plan editor (local draft of plan fields + stages + accounts) ----
  const [pLabel, setPLabel] = useState("");
  const [pYear, setPYear] = useState("");
  const [pFloat, setPFloat] = useState("");
  const [pHomeLo, setPHomeLo] = useState("");
  const [pHomeHi, setPHomeHi] = useState("");
  const [pPerMile, setPPerMile] = useState("");
  const [pMaintFloor, setPMaintFloor] = useState("");
  const [pLeaveWeeks, setPLeaveWeeks] = useState("");
  const [pTaxPct, setPTaxPct] = useState("");
  const [pMinMove, setPMinMove] = useState("");
  const [pObjPct, setPObjPct] = useState("");
  const [pFirstMonth, setPFirstMonth] = useState("");
  const [pStages, setPStages] = useState<PlanStageRow[]>([]);
  const [pAccounts, setPAccounts] = useState<AccountRow[]>([]);

  const openPlanEditor = () => {
    if (!plan) return;
    setPLabel(plan.label);
    setPYear(String(plan.year));
    setPFloat(String(plan.float_line));
    setPHomeLo(plan.float_line_home_lo ?? "");
    setPHomeHi(plan.float_line_home_hi ?? "");
    setPPerMile(String(plan.maintenance_per_mile ?? ""));
    setPMaintFloor(String(plan.maintenance_floor ?? ""));
    setPLeaveWeeks(String(plan.leave_weeks ?? ""));
    setPTaxPct(String(plan.tax_pct ?? ""));
    setPMinMove(String(plan.min_move ?? ""));
    setPObjPct(String(plan.objective_pct ?? ""));
    setPFirstMonth(day(plan.first_money_month).slice(0, 7));
    setPStages([...plan.stages].sort((a, b) => a.position - b.position));
    setPAccounts(activeAccounts.map((a) => ({ ...a })));
    setError(null);
    setShowPlan(true);
  };

  const moveStage = (i: number, dir: -1 | 1) => {
    setPStages((rows) => {
      const j = i + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const editStage = (i: number, patch: Partial<PlanStageRow>) =>
    setPStages((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const planSettings = () => ({
    label: pLabel.trim(),
    year: Number(pYear),
    float_line: Number(pFloat),
    float_line_home_lo: pHomeLo ? Number(pHomeLo) : null,
    float_line_home_hi: pHomeHi ? Number(pHomeHi) : null,
    maintenance_per_mile: Number(pPerMile),
    maintenance_floor: Number(pMaintFloor),
    leave_weeks: Number(pLeaveWeeks),
    tax_pct: Number(pTaxPct),
    min_move: Number(pMinMove),
    objective_pct: Number(pObjPct),
    first_money_month: `${pFirstMonth}-01`,
  });

  const savePlan = async () => {
    if (!plan) return;
    // A blank would save as 0 and quietly stop the accrual — refuse it.
    const numeric: [string, string][] = [
      ["Year", pYear], ["Ops float line", pFloat], ["Maintenance $ per mile", pPerMile],
      ["Maintenance floor", pMaintFloor], ["Tax %", pTaxPct], ["Minimum movement", pMinMove], ["Split objective %", pObjPct],
    ];
    const bad = numeric.find(([, v]) => v.trim() === "" || !Number.isFinite(Number(v)));
    if (bad) { setError(`${bad[0]} needs a number`); return; }
    if ([pTaxPct, pObjPct].some((v) => Number(v) < 0 || Number(v) > 100)) { setError("Percentages run 0–100"); return; }
    if (!/^\d{4}-\d{2}$/.test(pFirstMonth)) { setError("First money month needs a month"); return; }
    setBusy(true);
    setError(null);
    try {
      await patchPlan(plan.plan_id, planSettings());
      // Persist the accounts: new create, edited patch, removed deactivate
      // (history keeps its balance rows — REMOVE hides, it never erases).
      for (let i = 0; i < pAccounts.length; i++) {
        const a = pAccounts[i];
        const body = { name: a.name.trim(), role: a.role, position: i + 1, active: true };
        if (a.account_id.startsWith("new-")) await createAccount(body);
        else await patchAccount(a.account_id, body);
      }
      for (const a of activeAccounts) {
        if (!pAccounts.some((x) => x.account_id === a.account_id)) {
          await patchAccount(a.account_id, { active: false });
        }
      }
      const keepIds = new Set<string>();
      for (let i = 0; i < pStages.length; i++) {
        const s = pStages[i];
        const body = {
          position: i + 1,
          label: s.label,
          kind: s.kind,
          obligation_id: s.obligation_id,
          target_lo: s.target_lo === "" ? null : s.target_lo,
          target_hi: s.target_hi === "" ? null : s.target_hi,
        };
        if (s.stage_id.startsWith("new-")) {
          await createStage(plan.plan_id, body);
        } else {
          keepIds.add(s.stage_id);
          await patchStage(s.stage_id, body);
        }
      }
      for (const s of plan.stages) {
        if (!keepIds.has(s.stage_id) && !pStages.some((x) => x.stage_id === s.stage_id)) {
          await deleteStage(s.stage_id);
        }
      }
      setShowPlan(false);
      await load();
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Could not save the plan",
      );
    } finally {
      setBusy(false);
    }
  };

  const writeNextYearPlan = async () => {
    if (!plan) return;
    if (
      !window.confirm(
        `Write The ${plan.year + 1} Plan? It starts from this plan's settings and stages and becomes active; ${plan.year}'s snapshots and history stay put.`,
      )
    )
      return;
    setBusy(true);
    try {
      const next = await createPlan({
        label: `The ${plan.year + 1} Plan`,
        year: plan.year + 1,
        float_line: Number(plan.float_line),
        float_line_home_lo: plan.float_line_home_lo ? Number(plan.float_line_home_lo) : null,
        float_line_home_hi: plan.float_line_home_hi ? Number(plan.float_line_home_hi) : null,
        maintenance_weekly: Number(plan.maintenance_weekly),
        tax_weekly: Number(plan.tax_weekly),
        maintenance_per_mile: Number(plan.maintenance_per_mile),
        maintenance_floor: Number(plan.maintenance_floor),
        leave_weeks: Number(plan.leave_weeks),
        tax_pct: Number(plan.tax_pct),
        min_move: Number(plan.min_move),
        objective_pct: Number(plan.objective_pct),
        first_money_month: `${plan.year + 1}-01-01`,
        active: true,
      });
      for (const s of [...plan.stages].sort((a, b) => a.position - b.position)) {
        await createStage(next.plan_id, {
          position: s.position,
          label: s.label,
          kind: s.kind,
          obligation_id: s.obligation_id,
          target_lo: s.target_lo,
          target_hi: s.target_hi,
        });
      }
      setShowPlan(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-56 mb-6" />
        <Skeleton className="h-40 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );

  // ---- derived words ----
  const perMile = plan ? num(plan.maintenance_per_mile) : null;
  const taxPct = plan ? num(plan.tax_pct) : null;
  const objPct = plan ? num(plan.objective_pct) : null; // null = unset: the words say so, never 70
  const objPctWords = objPct == null ? "the objective percent (unset)" : `${objPct} %`;
  const householdWords = objPct == null ? "the rest" : `${100 - objPct} %`;
  // A refusal's line, one per place the fix lives: balances in the snapshot
  // form, plan numbers in EDIT PLAN, anything else by its route.
  const refusalLines = (what: string, missing: MissingInput[]) => {
    const groups = new Map<string, MissingInput[]>();
    for (const m of missing) groups.set(m.fixTo ?? m.fixAt, [...(groups.get(m.fixTo ?? m.fixAt) ?? []), m]);
    return [...groups.values()].map((g) => (
      <MissingInputLine
        key={g[0].key}
        what={what}
        missing={g}
        onFix={g[0].fixAt === FIX_SNAPSHOT ? () => openSnapshot(false) : openPlanEditor}
        className="block mt-[2px]"
      />
    ));
  };
  const noBalance = <span className="text-faint">no balance typed</span>;
  const floatLine = plan ? num(plan.float_line) : null;
  const objective =
    view?.objectiveIndex != null && view.waterfall ? view.waterfall.stages[view.objectiveIndex] : null;
  const objectiveName = objective?.stage.label ?? "the current objective";
  const pendingLabel = pending ? monthName(pending.month) : null;
  // The Ops figure follows the same number the math uses: an OPS NOW check
  // typed after the snapshot replaces the snapshot's Ops balance.
  const opsBal = opsFromCheck ? Number(opsFromCheck.balance) : balanceOf(latest, opsAcct?.account_id);
  const vaultBal = balanceOf(latest, vaultAcct?.account_id);
  const maintBal = balanceOf(latest, maintAcct?.account_id);
  const taxBal = balanceOf(latest, taxAcct?.account_id);
  const floorsBoard: FloorStatus[] = view?.interlock?.floors ?? [];
  const acc = view?.accrual ?? null;
  const prevTax = prevFiled && taxPct != null ? getTaxMove(prevFiled.pretax, taxPct) : null;
  const owedMiles = owedToday.weeks.length ? owedToday.miles : null;
  const accrualWords =
    owedToday.weeks.length && acc != null && perMile != null
      ? `accrue Maintenance ${money(acc)} (${owedTodayMiles!.toLocaleString("en-US")} mi × $${perMile}${catchUpMiles !== 0 ? ` · incl. ${catchUpMiles > 0 ? "+" : "−"}${Math.abs(catchUpMiles).toLocaleString("en-US")} mi re-trued` : ""})`
      : lastAccrual
        ? `nothing to accrue — week ${weekLabel(payWeekOf(day(lastAccrual.pay_week_start)))} accrued ${formatDate(lastAccrual.as_of)}`
        : "nothing to accrue yet";
  const floorTitle: Record<FloorStatus["key"], string> = {
    ops: `${opsAcct?.name ?? "Ops"} · the float line`,
    maintenance: `${maintAcct?.name ?? "Maintenance"} · working minimum`,
    vault: `${vaultAcct?.name ?? "Vault"} · general reserve`,
  };
  const floorBalanceBefore: Record<FloorStatus["key"], number | null> = { ops: opsBal, maintenance: maintBal, vault: vaultBal };
  const stampFor = (f: FloorStatus, i: number): { tone: "amber" | "dim" | "pos"; text: string } =>
    f.met === null ? { tone: "dim", text: "WAITS" } : f.met ? { tone: "pos", text: "MET" } : f.state === "held" ? { tone: "amber", text: "HELD" } : { tone: "dim", text: i === 1 ? "NEXT" : "THEN" };

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">ACCOUNT STATUS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            where the money stands
          </span>
          {plan && (
            <span className="font-display text-[14px] tracking-[.12em] text-amber-hi rounded-[4px] px-[9px] pt-[3px] pb-[2px] rotate-[-1.2deg]"
              style={{ border: "1.5px solid color-mix(in srgb, var(--color-amber-hi) 55%, transparent)" }}>
              {plan.label.toUpperCase()}
            </span>
          )}
          <button
            onClick={openPlanEditor}
            className="font-condensed font-semibold text-[12px] tracking-[.06em] text-dim hover:text-ink"
          >
            EDIT PLAN ▸
          </button>
          <span className="flex-1" />
          {pending && pendingLabel && (
            <button
              onClick={() => openSnapshot(true)}
              className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[13px] tracking-[.05em] text-amber-hi bg-well border"
              style={{ borderColor: "color-mix(in srgb, var(--color-amber) 35%, transparent)", boxShadow: "var(--shadow-inset)" }}
            >
              MONEY DAY · {pendingLabel.split(" ")[0].toUpperCase()} ▸
            </button>
          )}
          <button
            onClick={() => openSnapshot(false)}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow: "0 5px 14px color-mix(in srgb, var(--color-amber) 30%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-ink) 50%, transparent)",
            }}
          >
            + FRIDAY SNAPSHOT
          </button>
        </div>

        {/* the plan sentence */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          {view?.verdict ? (
            <>
              <span
                className="font-forge font-bold text-[14px] tracking-[.14em] rounded-[8px] px-3 py-[2px] rotate-[-2deg] border-2"
                style={
                  view.verdict === "on-plan"
                    ? { color: "var(--color-status-positive-text)", borderColor: "var(--color-status-positive-text)", boxShadow: "inset 0 0 12px color-mix(in srgb, var(--color-status-positive-text) 12%, transparent)" }
                    : { color: "var(--color-amber-hi)", borderColor: "var(--color-amber-hi)", boxShadow: "inset 0 0 12px color-mix(in srgb, var(--color-amber) 12%, transparent)" }
                }
              >
                {view.verdict === "on-plan" ? "ON PLAN" : view.verdict === "floors-first" ? "FLOORS FIRST" : "BELOW FLOAT — HOLD"}
              </span>
              {/* the stamp names its basis (PL-04): the Ops number it read and the moves it took off */}
              <span className="font-condensed text-[12px] text-faint">
                {verdictBasis(view, {
                  opsWords: opsFromCheck
                    ? `OPS NOW ${formatDate(opsFromCheck.as_of) ?? opsFromCheck.as_of}`
                    : latest
                      ? `the ${formatDate(latest.as_of) ?? latest.as_of} snapshot`
                      : "no snapshot",
                  accrualMoved,
                })}
              </span>
            </>
          ) : view && view.waitingOn.length > 0 ? (
            <>
              <span className="font-forge font-bold text-[14px] tracking-[.14em] rounded-[8px] px-3 py-[2px] border-2 border-dashed border-hairline text-faint">
                VERDICT WAITS
              </span>
              <span>{refusalLines("give the verdict", view.waitingOn)}</span>
            </>
          ) : (
            <span className="font-forge font-bold text-[14px] tracking-[.14em] rounded-[8px] px-3 py-[2px] border-2 border-dashed border-hairline text-faint">
              NO SNAPSHOT YET
            </span>
          )}
          <span className="text-[13.5px] text-faint">
            this Friday: <b className="font-semibold text-ink">{accrualWords}</b>
            {pending && pendingLabel ? (
              <>
                {" "}· <b className="font-semibold text-amber-hi">{pendingLabel.split(" ")[0]}'s money day is open</b> — P&amp;L filed,{" "}
                {pending.pretaxProfit == null
                  ? "no profit figure on the filed P&L"
                  : pending.pretaxProfit < 0
                    ? `a loss of ${money(-pending.pretaxProfit)}`
                    : `profit ${money(pending.pretaxProfit)}`}
                {queue.length === 2 && <> · {monthName(queue[1].month).split(" ")[0]}'s is queued behind it</>}
                {queue.length > 2 && <> · {queue.length - 1} more months are queued behind it</>}
              </>
            ) : null}
            {opensNext && <> · {opensNext.split(" ")[0]}'s opens when its P&amp;L lands</>}
            {latest && <> · snapshot {formatDate(latest.as_of)}</>}
            {opsFromCheck && <> · <b className="font-semibold text-ink">OPS NOW</b> {formatDate(opsFromCheck.as_of)} — the Ops number</>}
            {" "}· <b className="font-semibold text-ink">{snapshots.length}</b> week
            {snapshots.length === 1 ? "" : "s"} tracked
          </span>
        </div>

        {/* the money day panel — refused when an input it needs isn't set */}
        {pending && pendingLabel && preview?.moneyDayRefused && !preview.moneyDay && (
          <div className="ds2-board overflow-hidden mt-4" style={{ borderLeft: "3px solid var(--color-amber)" }}>
            <div className={BOARD_HEAD}>
              <span className={BOARD_TITLE}>Money day · {pendingLabel} — the P&amp;L is filed</span>
              <span className={BOARD_SUB}>· nothing moves on a guess</span>
            </div>
            <div className="px-4 py-3">{refusalLines(preview.moneyDayRefused.what, preview.moneyDayRefused.missing)}</div>
          </div>
        )}
        {/* the money day panel */}
        {pending && pendingLabel && preview?.moneyDay && (() => {
          const md = preview.moneyDay;
          const il = md.interlock;
          const held = il.heldBy ? il.floors.find((f) => f.key === il.heldBy)! : null;
          const fills = il.floors.filter((f) => f.fill > 0);
          const step = (k: number, what: string, value: string, dim = false) => (
            <div className="grid grid-cols-[34px_1fr_auto] gap-3 items-baseline px-4 py-[10px] border-t ds2-cell-rule first:border-t-0">
              <span className="font-display text-[20px] text-amber tracking-[.04em]">{k}</span>
              <span className="font-condensed text-[14px] text-dim">{what}</span>
              <span className={`font-condensed font-semibold text-[15px] text-right whitespace-nowrap ${dim ? "text-faint" : "text-hot"}`}>{value}</span>
            </div>
          );
          return (
            <div className="ds2-board overflow-hidden mt-4" style={{ borderLeft: "3px solid var(--color-amber)" }}>
              <div className={BOARD_HEAD}>
                <span className={BOARD_TITLE}>Money day · {pendingLabel} — the P&amp;L is filed</span>
                <span className={BOARD_SUB}>· run it any day but the month's first Friday · previewed on the {formatDate(latest?.as_of)} balances</span>
              </div>
              {step(1, `Tax — ${md.taxPct} % of ${pendingLabel.split(" ")[0]}'s pre-tax profit (${md.pretaxProfit < 0 ? "−" : ""}${money(Math.abs(md.pretaxProfit))})`, md.pretaxProfit < 0 ? "$0 · a loss" : money(md.tax))}
              {step(
                2,
                `The interlock — Ops ${fmtMoney(md.opsAfter)} after ${md.tax > 0 ? "the accrual and the tax move" : "this week's accrual"}, floor ${floatLine != null ? money(floatLine) : "unset"}`,
                held ? `HELD — ${held.label}, short ${held.short != null ? money(held.short) : "unknown"}` : "all three floors hold",
                !held,
              )}
              {step(
                3,
                md.belowMin ? `Surplus — under the ${money(md.minMove)} minimum` : held?.key === "ops" ? "Surplus — nothing above the float to direct" : "Surplus — directed to the floors first",
                md.belowMin
                  ? `${money(md.surplus)} — nothing moves`
                  : md.surplus <= 0
                    ? "$0"
                    : fills.length
                      ? `${money(md.surplus)} → ${fills.map((f) => `${f.key === "vault" ? vaultAcct?.name ?? "Vault" : maintAcct?.name ?? "Maintenance"} ${money(f.fill)}`).join(" · ")}`
                      : money(md.surplus),
                md.surplus <= 0 || md.belowMin,
              )}
              {step(
                4,
                `Split — ${objectiveName} · household (${objPctWords} · ${householdWords})`,
                il.heldBy || md.belowMin || il.remainder <= 0
                  ? `$0 · $0 — ${md.belowMin ? "under the minimum" : "interlock"}`
                  : `${money(md.objective)} · ${money(md.household)}`,
                !!il.heldBy || md.belowMin || il.remainder <= 0,
              )}
              <div className="flex items-center gap-3 px-4 py-2 border-t ds2-cell-rule">
                <span className={BOARD_SUB}>the seven-line entry for Excel is on the form ·</span>
                <button
                  onClick={() => openSnapshot(true)}
                  className="font-condensed font-semibold text-[12.5px] tracking-[.06em] text-amber-hi hover:text-hot"
                >
                  RUN {pendingLabel.split(" ")[0].toUpperCase()}'S MONEY DAY ▸
                </button>
              </div>
            </div>
          );
        })()}

        {/* ops + vault */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div
            className="rounded-[14px] border overflow-hidden"
            style={{ background: "linear-gradient(180deg, var(--color-well), var(--color-panel))", borderColor: "var(--color-hairline)", boxShadow: "var(--shadow-pop)" }}
          >
            <div className="px-4 py-3 border-b ds2-cell-rule flex items-baseline gap-3" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--color-amber) 8%, transparent), transparent 55%)" }}>
              <span className="font-forge font-bold text-[17px]" style={{ letterSpacing: "1.5px" }}>OPS — THE FLOAT</span>
              <span className="ml-auto font-condensed text-[12px] text-amber-hi">floor 1 · {floatLine != null ? money(floatLine) : "—"}</span>
            </div>
            <div className="p-4">
              <p className="font-display text-[40px] leading-none tabular-nums">
                {opsBal != null ? money(opsBal) : <span className="font-condensed text-[18px] text-faint">no balance typed</span>}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-1">
                ops balance
                {view?.opsAfter != null && !accrualMoved && ((acc != null && acc > 0) || (view.moneyDay != null && view.moneyDay.tax > 0)) && (
                  <> · {fmtMoney(view.opsAfter)} after {view.moneyDay && view.moneyDay.tax > 0 ? "the moves" : "the accrual"}</>
                )}
                {accrualMoved && <> · the accrual is already in the balances</>}
                {floorsBoard[0] && floorsBoard[0].short != null && (floorsBoard[0].short > 0 ? <> · short {money(floorsBoard[0].short)}</> : <> · holds the float</>)}
              </p>
              <p className="font-condensed text-[12.5px] text-dim mt-3">
                {view?.verdict === "below-float"
                  ? `Below the float. Nothing leaves Ops but the accrual until it holds ${floatLine != null ? money(floatLine) : "the float line"}.`
                  : view?.verdict === "floors-first"
                    ? `Ops holds the float. On the money day the surplus fills ${maintAcct?.name ?? "Maintenance"} and the ${vaultAcct?.name ?? "Vault"} to their floors before anything is split.`
                    : view?.verdict === "on-plan"
                      ? `Every floor holds. On the money day the surplus splits ${objPctWords} to ${objectiveName} · ${householdWords} household.`
                      : view && view.waitingOn.length > 0
                        ? "The verdict waits — see what it needs above."
                        : "Take the first Friday snapshot and the orders appear here."}
              </p>
              <p className="font-condensed text-[11.5px] text-faint mt-3">
                snapshot first, then move the money — next week's snapshot confirms the moves landed.
                {plan?.float_line_home_lo && (
                  <> home-time weeks run {money(Number(plan.float_line_home_lo))}–{money(Number(plan.float_line_home_hi ?? plan.float_line_home_lo))}.</>
                )}
              </p>
            </div>
          </div>

          <div
            className="rounded-[14px] border overflow-hidden"
            style={{ background: "linear-gradient(180deg, var(--color-well), var(--color-panel))", borderColor: "var(--color-hairline)", boxShadow: "var(--shadow-pop)" }}
          >
            <div className="px-4 py-3 border-b ds2-cell-rule flex items-baseline gap-3" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--color-amber) 8%, transparent), transparent 55%)" }}>
              <span className="font-forge font-bold text-[17px]" style={{ letterSpacing: "1.5px" }}>THE VAULT — GENERAL RESERVE</span>
              <span className="ml-auto font-condensed text-[12px] text-amber-hi">floor 3 · {floorsBoard[2]?.floor != null ? money(floorsBoard[2].floor) : "unset"}</span>
            </div>
            <div className="p-4">
              <p className="font-display text-[40px] leading-none tabular-nums">
                {vaultBal != null ? money(vaultBal) : <span className="font-condensed text-[18px] text-faint">no balance typed</span>}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-1">
                vault balance
                {latest?.note && <> · {formatDate(latest.as_of)}: <span className="normal-case tracking-normal">"{latest.note.length > 64 ? `${latest.note.slice(0, 64)}…` : latest.note}"</span></>}
              </p>
              <p className="font-condensed text-[12.5px] text-dim mt-3">
                {floorsBoard[2] && floorsBoard[2].met === false && floorsBoard[2].floor != null
                  ? `Third in the fill order — after ${opsAcct?.name ?? "Ops"} and ${maintAcct?.name ?? "Maintenance"} hold their floors, the surplus builds this to ${money(floorsBoard[2].floor)}.`
                  : view?.cushion
                    ? `The floor holds · ${money(view.cushion.toGoal)} to the goal. Money above the ratchet goes whole to ${objectiveName}.`
                    : "The floor is the ladder's first vault rung — set it in EDIT PLAN."}
              </p>
            </div>
          </div>
        </div>

        {/* the interlock */}
        {view?.interlock && (
          <div className="ds2-board overflow-hidden mt-4">
            <div className={BOARD_HEAD}>
              <span className={BOARD_TITLE}>The interlock — three floors, filled in this order before anything is distributed</span>
              <span className={BOARD_SUB}>· {opsAcct?.name ?? "Ops"} → {maintAcct?.name ?? "Maintenance"} → {vaultAcct?.name ?? "Vault"}</span>
            </div>
            {floorsBoard.map((f, i) => {
              const before = floorBalanceBefore[f.key];
              const st = stampFor(f, i);
              const pct = f.floor != null && f.floor > 0 && f.balance != null ? Math.min(1, Math.max(0, (f.balance + f.fill) / f.floor)) : 0;
              return (
                <div key={f.key} className="flex items-center gap-[14px] px-4 py-3 border-t ds2-cell-rule first:border-t-0">
                  <Ring state={f.met ? "done" : f.state === "held" ? "act" : "pend"}>{i + 1}</Ring>
                  <div className="flex-1 min-w-0">
                    <p className="font-condensed font-semibold text-[15px]">{floorTitle[f.key]}</p>
                    <p className="font-condensed text-[12px] text-faint mt-[2px]">
                      {before != null ? money(before) : noBalance}
                      {f.key !== "vault" && f.balance != null && before != null && Math.round(f.balance) !== Math.round(before) && (
                        <> → {fmtMoney(f.balance)} after the {f.key === "ops" && view.moneyDay && view.moneyDay.tax > 0 ? "moves" : "accrual"}</>
                      )}
                      {" "}· floor {f.floor != null ? money(f.floor) : "unset"}
                      {f.fill > 0 && <> · <span className="text-amber-hi">fills {money(f.fill)} today</span></>}
                      {f.short == null ? (
                        <> · <span className="text-amber-hi">waits</span></>
                      ) : f.short > 0 ? (
                        <> · <span className={f.state === "held" ? "text-amber-hi" : ""}>short {money(f.short)}</span></>
                      ) : (
                        <> · holds</>
                      )}
                    </p>
                    {f.missing.length > 0 && <p className="mt-[2px]">{refusalLines(`judge the ${f.label} floor`, f.missing)}</p>}
                    <div className="max-w-[320px] mt-[6px]">
                      <Cells pct={pct} dim={f.state === "next"} />
                    </div>
                  </div>
                  <Stamp tone={st.tone}>{st.text}</Stamp>
                </div>
              );
            })}
            {maintAcct == null && (
              <p className="font-condensed text-[12px] text-amber-hi px-4 py-2 border-t ds2-cell-rule">
                No account carries the maintenance role — give your Maintenance account the role in EDIT PLAN so floor 2 can be read.
              </p>
            )}
            <div className="px-4 py-2 border-t ds2-cell-rule">
              <span className={BOARD_SUB}>
                when all three hold: surplus × {objPctWords} → {objectiveName} · × {householdWords} → household · under {num(plan?.min_move) != null ? money(num(plan?.min_move)!) : "the minimum (unset)"} nothing moves
              </span>
            </div>
          </div>
        )}

        {/* the ladder */}
        {status?.waterfall && (
          <div className="ds2-board overflow-hidden mt-4">
            <div className={BOARD_HEAD}>
              <span className={BOARD_TITLE}>The ladder — one objective at a time</span>
              <span className={BOARD_SUB}>· rung 1 is floor 3 · edit the rungs in EDIT PLAN</span>
            </div>
            {status.waterfall.stages.map((st, i) => {
              const floorStage = stageInputs.filter((s) => s.kind === "vault").sort((a, b) => a.position - b.position)[0];
              const isFloor = st.stage.kind === "vault" && floorStage != null && st.stage.position === floorStage.position;
              const isObjective = i === status.objectiveIndex;
              const ring = st.state === "done" ? "done" : isObjective ? "act" : "pend";
              const quiet = st.state !== "done" && !isObjective && !isFloor;
              return (
                <div
                  key={st.stage.stage_id ?? st.stage.position}
                  className={`flex items-center gap-[14px] px-4 py-3 border-t ds2-cell-rule first:border-t-0 ${quiet ? "opacity-55" : ""}`}
                >
                  <Ring state={ring}>{st.stage.position}</Ring>
                  <div className="flex-1 min-w-0">
                    <p className="font-condensed font-semibold text-[15px]">
                      {st.stage.label}
                      {st.state === "done" && <Stamp tone="pos">DONE</Stamp>}
                      {st.state !== "done" && isFloor && <Stamp tone="dim">FLOOR 3</Stamp>}
                      {isObjective && <Stamp tone="amber">CURRENT OBJECTIVE</Stamp>}
                    </p>
                    {st.stage.kind === "obligation" && st.currentValue == null && (
                      <p className="font-condensed text-[12px] text-faint mt-[2px]">
                        not bound to an obligation yet — bind it in EDIT PLAN to grade this stage
                      </p>
                    )}
                    {st.state !== "done" && isFloor && (
                      <p className="font-condensed text-[12px] text-faint mt-[2px]">
                        {st.currentValue != null ? money(st.currentValue) : "no balance typed"}{num(st.stage.target_lo) != null && <> of {money(num(st.stage.target_lo)!)}</>} · filled by the interlock, not the split
                      </p>
                    )}
                    {st.missing.length > 0 && <p className="mt-[2px]">{refusalLines(`grade rung ${st.stage.position}`, st.missing)}</p>}
                    {isObjective && (
                      <p className="font-condensed text-[12px] text-amber-hi mt-[2px]">
                        {st.stage.kind === "obligation" && st.currentValue != null && (
                          <>{money(st.currentValue)} left{st.stage.obligation?.original_balance ? ` of ${money(st.stage.obligation.original_balance)}` : ""} · </>
                        )}
                        gets {objPctWords} of the surplus once the floors hold
                        {st.overflow != null && st.overflow > 0
                          ? ` · ${money(st.overflow)} above the ratchet — send it here whole`
                          : " · anything above the ratchet in the Vault still goes here whole"}
                      </p>
                    )}
                    <div className="max-w-[340px] mt-[6px]">
                      <Cells pct={st.progress} dim={quiet} />
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-condensed">
                    <p className="font-semibold text-[14px] tabular-nums">
                      {st.currentValue != null ? money(st.currentValue) : "—"}
                    </p>
                    <p className="text-[10.5px] text-faint">
                      {st.stage.kind === "obligation"
                        ? "balance left"
                        : st.stage.kind === "trailer"
                          ? `above the ratchet${num(st.stage.target_lo) != null ? ` · of ${money(num(st.stage.target_lo)!)}${st.stage.target_hi ? `–${money(Number(st.stage.target_hi))}` : ""}` : " · no target"}`
                          : st.stage.target_lo != null
                            ? `of ${money(Number(st.stage.target_lo))}${st.stage.target_hi ? `–${money(Number(st.stage.target_hi))}` : ""}`
                            : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* reserves */}
        <div className="ds2-board overflow-hidden mt-4">
          <div className={BOARD_HEAD}>
            <span className={BOARD_TITLE}>Reserves</span>
            <span className={BOARD_SUB}>
              {plan && `· $${perMile ?? "—"}/mi to ${maintAcct?.name ?? "Maintenance"} every Friday · ${taxPct ?? "—"} % of profit to ${taxAcct?.name ?? "Tax"} on the money day`}
            </span>
          </div>
          {maintAcct && (
            <div className="flex items-center gap-4 px-4 py-3 border-t ds2-cell-rule first:border-t-0">
              <div className="flex-1 min-w-0">
                <p className="font-condensed font-semibold text-[16px]">
                  {maintAcct.name} <span className="text-[13px] text-faint font-normal">{maintBal != null ? money(maintBal) : "no balance typed"}</span>
                </p>
                <p className="font-condensed text-[13px] text-dim mt-[2px]">
                  {owedToday.weeks.length && acc != null && perMile != null ? (
                    <>
                      <b className="text-hot font-semibold">Accrue {money(acc)} this Friday</b> — pay week {owedToday.label},{" "}
                      {owedToday.source === "odometer" ? (
                        <>
                          {owedMiles!.toLocaleString("en-US")} mi by odometer ({owedToday.readingsWords})
                          {catchUpMiles !== 0 && <> {catchUpMiles > 0 ? "+" : "−"} {Math.abs(catchUpMiles).toLocaleString("en-US")} mi re-trued</>} × ${perMile} · loads say {owedToday.loadsMiles.toLocaleString("en-US")} ({owedToday.loads} load{owedToday.loads === 1 ? "" : "s"}: {owedToday.loadedMiles.toLocaleString("en-US")} loaded + {owedToday.deadheadMiles.toLocaleString("en-US")} deadhead)
                        </>
                      ) : (
                        <>
                          {owedMiles!.toLocaleString("en-US")} mi from {owedToday.loads} load{owedToday.loads === 1 ? "" : "s"} ({owedToday.loadedMiles.toLocaleString("en-US")} loaded + {owedToday.deadheadMiles.toLocaleString("en-US")} deadhead)
                          {catchUpMiles !== 0 && <> {catchUpMiles > 0 ? "+" : "−"} {Math.abs(catchUpMiles).toLocaleString("en-US")} mi re-trued</>} × ${perMile} · no odometer reading before the week
                        </>
                      )}
                      {owedToday.truncated && <span className="text-amber-hi"> · more than 8 weeks owed — only the last 8 are counted</span>}
                      {catchUpMiles !== 0 && retrue && (
                        <>
                          {" "}· <b className="text-amber-hi font-semibold">{catchUpMiles > 0 ? "catch-up" : "hold-back"} {money(Math.abs(catchUpMiles) * perMile)}</b> — {retrueWords(retrue)}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {accrualWords}
                      {catchUpMiles !== 0 && retrue && perMile != null && (
                        <>
                          {" "}· <b className="text-amber-hi font-semibold">{catchUpMiles > 0 ? "catch-up" : "hold-back"} {money(Math.abs(catchUpMiles) * perMile)}</b> waits for the next accrual: {retrueWords(retrue)}
                        </>
                      )}
                    </>
                  )}
                  {floorsBoard[1] && floorsBoard[1].floor != null && floorsBoard[1].short != null && (floorsBoard[1].short > 0 ? <> · floor {money(floorsBoard[1].floor)}, {money(floorsBoard[1].short)} short after</> : <> · floor {money(floorsBoard[1].floor)} holds</>)}
                </p>
                {status?.accrualFlag && (
                  <p className="font-condensed text-[12px] text-amber-hi mt-[2px]">{status.accrualFlag}</p>
                )}
                {owedToday.weeks.length > 0 && owedTodayMiles == null && (
                  <p className="mt-[2px]">
                    {refusalLines("accrue Maintenance", [{ key: "accrual_miles", label: `the mileage for pay week ${owedToday.label} (no odometer reading, and its loads don't carry them)`, fixAt: FIX_SNAPSHOT }])}
                  </p>
                )}
              </div>
              <span className={`font-condensed font-semibold text-[10.5px] tracking-[.09em] uppercase rounded-[11px] px-[10px] py-[3px] whitespace-nowrap ${owedToday.weeks.length ? "text-status-positive-text bg-status-positive-text/10" : "text-dim bg-dim/12"}`}>
                {owedToday.weeks.length ? "this Friday" : "accrued"}
              </span>
            </div>
          )}
          {taxAcct && (
            <div className="flex items-center gap-4 px-4 py-3 border-t ds2-cell-rule">
              <div className="flex-1 min-w-0">
                <p className="font-condensed font-semibold text-[16px]">
                  {taxAcct.name} <span className="text-[13px] text-faint font-normal">{taxBal != null ? money(taxBal) : "no balance typed"}</span>
                </p>
                <p className="font-condensed text-[13px] text-dim mt-[2px]">
                  {pending && pendingLabel && preview?.moneyDay ? (
                    <>
                      {pendingLabel.split(" ")[0]}'s money day: {taxPct} % of {pending.pretaxProfit != null && pending.pretaxProfit < 0 ? "−" : ""}{pending.pretaxProfit != null ? money(Math.abs(pending.pretaxProfit)) : "no profit figure"} = <b className="text-ink font-semibold">{money(preview.moneyDay.tax)}</b>
                      {prevFiled && prevTax != null && (() => {
                        // A settled month reads what its money day MOVED (085),
                        // never today's P&L — unless it settled before the amount
                        // was kept, and then the words say so.
                        const by = snapshots.find((s) => day(s.settles_month) === prevFiled.month) ?? null;
                        const stored = by && by.tax_moved != null ? Number(by.tax_moved) : null;
                        const name = monthName(prevFiled.month).split(" ")[0];
                        if (!by) return <> · {name} would have moved {money(prevTax)}</>;
                        return stored != null ? (
                          <> · {name} moved {money(stored)} on {formatDate(by.as_of)}</>
                        ) : (
                          <> · {name} moved {money(prevTax)} by today's P&amp;L — the amount wasn't kept before Nov 4, 2026</>
                        );
                      })()}
                    </>
                  ) : (
                    <>nothing owed — every filed month has had its money day</>
                  )}
                  {opensNext && <> · {opensNext.split(" ")[0]} waits for its P&amp;L</>}
                </p>
              </div>
              <span className="font-condensed font-semibold text-[10.5px] tracking-[.09em] uppercase rounded-[11px] px-[10px] py-[3px] whitespace-nowrap text-status-info-text bg-status-info-text/12">
                money day
              </span>
            </div>
          )}
          {otherReserves.map((a) => (
            <div key={a.account_id} className="flex items-center gap-4 px-4 py-3 border-t ds2-cell-rule">
              <p className="font-condensed font-semibold text-[16px] flex-1">
                {a.name} <span className="text-[13px] text-faint font-normal">{balanceOf(latest, a.account_id) != null ? money(balanceOf(latest, a.account_id)!) : "no balance typed"}</span>
              </p>
              <span className="font-condensed text-[11px] text-faint">watched</span>
            </div>
          ))}
          {!maintAcct && !taxAcct && otherReserves.length === 0 && (
            <p className="font-condensed text-[13px] text-faint px-4 py-4">
              No reserve accounts — add them in EDIT PLAN and give one the maintenance role and one the tax role.
            </p>
          )}
        </div>

        {/* the trend */}
        <div className="ds2-board overflow-hidden mt-4">
          <div className={BOARD_HEAD}>
            <span className={BOARD_TITLE}>The trend</span>
            <span className={BOARD_SUB}>· ops + vault, week by week</span>
          </div>
          <div className="px-2 pt-3 pb-1" style={{ height: 190 }}>
            {trend.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-hairline-lo)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" stroke="var(--color-faint)" fontSize={10.5} tickLine={false} axisLine={{ stroke: "var(--color-hairline)" }} />
                  <YAxis stroke="var(--color-faint)" fontSize={10.5} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-hairline)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [money(Number(v)), name === "ops" ? "ops" : "vault"]}
                  />
                  <Line type="monotone" dataKey="ops" stroke="var(--color-amber-hi)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="vault" stroke="var(--color-chart-blue)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="font-condensed text-[13px] text-faint px-3 py-6">
                The trend draws after two snapshots — one Friday at a time.
              </p>
            )}
          </div>
          <div className="flex gap-4 font-condensed text-[11px] text-faint px-4 pb-2">
            <span><i className="inline-block w-3.5 h-[3px] rounded align-middle mr-1" style={{ background: "var(--color-amber-hi)" }} />ops</span>
            <span><i className="inline-block w-3.5 h-[3px] rounded align-middle mr-1" style={{ background: "var(--color-chart-blue)" }} />vault</span>
          </div>
        </div>

        {/* snapshot popup — the Friday, or the money day with the month ticked */}
        {showSnap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnap(false)} />
            <div className="relative w-full max-w-[560px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--color-amber) 8%, transparent), transparent 55%)" }}>
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>
                  {formMoneyDay && pendingLabel ? `MONEY DAY · ${pendingLabel.toUpperCase()}` : "FRIDAY SNAPSHOT"}
                </span>
                <span className="font-condensed text-[11px] text-faint tracking-[.06em] uppercase">
                  {formMoneyDay ? "balances today, then the orders — snapshot first" : "raw balances — before you move anything"}
                </span>
                <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={() => setShowSnap(false)}>✕</button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>As of</label>
                  <input type="date" className={FIELD} value={fAsOf} max={todayKey()} onChange={(e) => changeAsOf(e.target.value)} />
                  {asOfFuture && (
                    <p className="font-condensed text-[11.5px] text-destructive mt-1">{dayWords(fAsOf)} hasn't happened — a snapshot is dated today or earlier</p>
                  )}
                </div>
                {activeAccounts.map((a) => (
                  <div key={a.account_id}>
                    <label className={LBL}>
                      {a.name}
                      {a.role !== "reserve" && (
                        <span className="normal-case tracking-normal text-amber-hi"> · {a.role}</span>
                      )}
                    </label>
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      className={FIELD}
                      value={fBalances[a.account_id] ?? ""}
                      onChange={(e) =>
                        setFBalances((m) => ({ ...m, [a.account_id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className={LBL}>
                    Miles{owedForm.weeks.length ? ` · pay week ${owedForm.label}` : ""}
                    <span className="normal-case tracking-normal text-amber-hi">
                      {owedForm.weeks.length
                        ? ` · first snapshot since it closed — accrues here, once`
                        : lastAccrual
                          ? ` · week ${weekLabel(payWeekOf(day(lastAccrual.pay_week_start)))} accrued ${formatDate(lastAccrual.as_of)} — nothing to accrue`
                          : " · nothing to accrue"}
                    </span>
                  </label>
                  <input
                    inputMode="numeric"
                    placeholder={owedForm.weeks.length ? "miles this pay week" : "—"}
                    className={`${FIELD} ${owedForm.weeks.length ? "border-amber" : "opacity-50"}`}
                    disabled={owedForm.weeks.length === 0}
                    value={fMiles}
                    onChange={(e) => setFMiles(e.target.value)}
                  />
                  {owedForm.weeks.length > 0 && (
                    <p className="font-condensed text-[11.5px] text-faint mt-1">
                      {owedForm.source === "odometer" ? (
                        <>
                          pre-filled by odometer: {owedForm.readingsWords} · the loads say {owedForm.loadsMiles.toLocaleString("en-US")} · edit if the truck says otherwise
                        </>
                      ) : (
                        <>
                          pre-filled from {owedForm.loads} load{owedForm.loads === 1 ? "" : "s"} ({owedForm.loadedMiles.toLocaleString("en-US")} loaded + {owedForm.deadheadMiles.toLocaleString("en-US")} deadhead) — no odometer reading before the week · edit if the truck says otherwise
                        </>
                      )}
                      {owedForm.endSlips && owedForm.endDate && (
                        <> · last reading {dayWords(owedForm.endDate)} — log the odometer for a tighter week</>
                      )}
                      {catchUpMiles !== 0 && retrue && (
                        <>
                          {" "}· <span className="text-amber-hi">{catchUpMiles > 0 ? "+" : "−"}{Math.abs(catchUpMiles).toLocaleString("en-US")} mi re-trued</span> — {retrueWords(retrue)} · in the pre-fill, accrues here once
                        </>
                      )}
                      {draftStatus?.accrualFlag && <span className="text-amber-hi"> · {draftStatus.accrualFlag}</span>}
                    </p>
                  )}
                </div>
                {pending && pendingLabel && (
                  <div className="col-span-2 rounded-[9px] px-3 py-[10px]" style={{ border: "1px solid color-mix(in srgb, var(--color-amber) 35%, transparent)", background: "color-mix(in srgb, var(--color-amber) 5%, transparent)" }}>
                    <label className="flex items-center gap-[10px] font-condensed text-[14px] cursor-pointer">
                      <input type="checkbox" className="accent-amber w-4 h-4" checked={formMoneyDay} disabled={firstFriday} onChange={(e) => setFMoneyDay(e.target.checked)} />
                      <span className={firstFriday ? "text-faint" : undefined}>Money day · <b className="font-semibold">{pendingLabel}</b> — tax, the interlock and the split on this snapshot</span>
                    </label>
                    <p className={`font-condensed text-[11.5px] mt-1 pl-[26px] ${firstFriday ? "text-amber-hi" : "text-faint"}`}>
                      {firstFriday
                        ? `${dayWords(fAsOf)} is the month's first Friday — the money day runs any other day`
                        : "P&L filed · untick if you're only taking Friday's balances today"}
                    </p>
                  </div>
                )}
                {formMoneyDay && draftStatus?.moneyDayRefused && (
                  <p className="col-span-2 border border-dashed border-hairline rounded-[8px] px-3 py-2">
                    {refusalLines(draftStatus.moneyDayRefused.what, draftStatus.moneyDayRefused.missing)}
                  </p>
                )}
                {formMoneyDay && draftStatus?.moneyDay ? (
                  <div className="col-span-2">
                    <label className={LBL}>The entry as you type · for Excel</label>
                    <pre className="font-mono text-[12px] leading-[1.6] text-ink bg-well border border-hairline rounded-[9px] px-3 py-2 overflow-x-auto whitespace-pre m-0">
                      {draftStatus.moneyDay.entry.join("\n")}
                    </pre>
                  </div>
                ) : draftStatus?.orders?.length ? (
                  <p className="col-span-2 font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-2">
                    the verdict as you type: <b className="text-amber-hi">{draftStatus.orders.join(" · ")}</b>
                  </p>
                ) : null}
                <div className="col-span-2"><label className={LBL}>Note · optional</label><input className={FIELD} value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="settlement + payroll landed" /></div>
                {error && <p className="col-span-2 text-destructive text-sm">{error}</p>}
              </div>
              <div className="flex gap-2 justify-end px-5 pb-5">
                <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline" onClick={() => setShowSnap(false)}>CANCEL</button>
                {formMoneyDay && draftStatus?.moneyDay && (
                  <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-amber-hi bg-well border" style={{ borderColor: "color-mix(in srgb, var(--color-amber) 35%, transparent)" }} onClick={copyEntry}>
                    {copied ? "COPIED" : "COPY THE ENTRY"}
                  </button>
                )}
                <button
                  className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
                  style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))" }}
                  disabled={
                    busy ||
                    asOfFuture ||
                    (formMoneyDay && !!draftStatus?.moneyDayRefused) ||
                    !opsAcct ||
                    !vaultAcct ||
                    activeAccounts.some((a) => (fBalances[a.account_id] ?? "").trim() === "")
                  }
                  onClick={saveSnapshot}
                >
                  {busy ? "SAVING…" : "SAVE SNAPSHOT"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* plan editor popup */}
        {showPlan && plan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowPlan(false)} />
            <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--color-amber) 8%, transparent), transparent 55%)" }}>
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>{plan.label.toUpperCase()}</span>
                {plan.active && <span className="font-condensed text-[11px] text-faint tracking-[.08em]">· ACTIVE</span>}
                <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={() => setShowPlan(false)}>✕</button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3">
                <div><label className={LBL}>Plan label</label><input className={FIELD} value={pLabel} onChange={(e) => setPLabel(e.target.value)} /></div>
                <div><label className={LBL}>Year</label><input inputMode="numeric" className={FIELD} value={pYear} onChange={(e) => setPYear(e.target.value)} /></div>
                <div><label className={LBL}>Ops float line · floor 1</label><input inputMode="decimal" className={FIELD} value={pFloat} onChange={(e) => setPFloat(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL}>Home wk lo</label><input inputMode="decimal" className={FIELD} value={pHomeLo} onChange={(e) => setPHomeLo(e.target.value)} /></div>
                  <div><label className={LBL}>Home wk hi</label><input inputMode="decimal" className={FIELD} value={pHomeHi} onChange={(e) => setPHomeHi(e.target.value)} /></div>
                </div>
                <div><label className={LBL}>Maintenance · $ per mile</label><input inputMode="decimal" className={`${FIELD} border-amber`} value={pPerMile} onChange={(e) => setPPerMile(e.target.value)} /></div>
                <div><label className={LBL}>Maintenance floor · floor 2</label><input inputMode="decimal" className={`${FIELD} border-amber`} value={pMaintFloor} onChange={(e) => setPMaintFloor(e.target.value)} /></div>
                <div><label className={LBL}>Leave horizon · weeks of a parked truck</label><input inputMode="numeric" className={`${FIELD} border-amber`} value={pLeaveWeeks} onChange={(e) => setPLeaveWeeks(e.target.value)} /></div>
                <div><label className={LBL}>Tax · % of pre-tax profit</label><input inputMode="decimal" className={`${FIELD} border-amber`} value={pTaxPct} onChange={(e) => setPTaxPct(e.target.value)} /></div>
                <div><label className={LBL}>Minimum movement</label><input inputMode="decimal" className={`${FIELD} border-amber`} value={pMinMove} onChange={(e) => setPMinMove(e.target.value)} /></div>
                <div><label className={LBL}>Split · objective % <span className="normal-case tracking-normal text-faint">household gets the rest</span></label><div className="flex items-center gap-2"><input inputMode="decimal" className={`${FIELD} border-amber`} value={pObjPct} onChange={(e) => setPObjPct(e.target.value)} /><span className="font-condensed text-[12px] text-faint whitespace-nowrap">· household {pObjPct.trim() !== "" && Number.isFinite(Number(pObjPct)) ? 100 - Number(pObjPct) : "—"}</span></div></div>
                <div><label className={LBL}>First money month</label><input type="month" className={`${FIELD} border-amber`} value={pFirstMonth} onChange={(e) => setPFirstMonth(e.target.value)} /></div>
                <p className="col-span-2 font-condensed text-[11.5px] text-faint">
                  Retired: {money(Number(plan.maintenance_weekly))}/wk maintenance · {money(Number(plan.tax_weekly))}/wk tax — kept on the row for history, not used. The Vault floor is not a setting: it is the ladder's first vault rung.
                </p>

                <p className="col-span-2 font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mt-2">
                  The accounts — what the snapshot asks for · one ops, one vault, one maintenance, one tax
                </p>
                {pAccounts.map((a, i) => (
                  <div key={a.account_id} className="col-span-2 flex gap-2 items-center">
                    <input
                      className={FIELD}
                      value={a.name}
                      onChange={(e) =>
                        setPAccounts((rows) => rows.map((r, k) => (k === i ? { ...r, name: e.target.value } : r)))
                      }
                    />
                    <select
                      className={FIELD}
                      style={{ maxWidth: 200 }}
                      value={a.role}
                      onChange={(e) =>
                        setPAccounts((rows) =>
                          rows.map((r, k) => (k === i ? { ...r, role: e.target.value as AccountRow["role"] } : r)),
                        )
                      }
                    >
                      <option value="ops">ops · the float</option>
                      <option value="vault">vault · general reserve</option>
                      <option value="maintenance">maintenance · working minimum</option>
                      <option value="tax">tax · the tax reserve</option>
                      <option value="reserve">reserve · watched</option>
                    </select>
                    <button
                      className="shrink-0 text-faint hover:text-status-negative-text px-1"
                      aria-label="Remove account"
                      onClick={() => setPAccounts((rows) => rows.filter((_, k) => k !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="col-span-2">
                  <button
                    className="font-condensed font-semibold text-[12.5px] tracking-[.06em] text-amber-hi hover:text-hot"
                    onClick={() =>
                      setPAccounts((rows) => [
                        ...rows,
                        { account_id: `new-${Date.now()}`, name: "New account", role: "reserve", position: rows.length + 1, active: true },
                      ])
                    }
                  >
                    + ADD ACCOUNT
                  </button>
                  <span className="font-condensed text-[11px] text-faint ml-3">
                    removing hides the account going forward — its history stays
                  </span>
                </div>

                <p className="col-span-2 font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mt-2">
                  The ladder — order is the plan · the first vault rung is floor 3 · debt rungs bind to an obligation
                </p>
                {pStages.map((s, i) => (
                  <div key={s.stage_id} className="col-span-2 rounded-[10px] border border-hairline-lo bg-well/50 p-3 grid grid-cols-[auto_1fr] gap-2">
                    <div className="flex flex-col gap-1">
                      <button className="text-faint hover:text-ink text-[12px]" aria-label="Move up" onClick={() => moveStage(i, -1)}>▲</button>
                      <span className="font-display text-[14px] text-center text-dim">{i + 1}</span>
                      <button className="text-faint hover:text-ink text-[12px]" aria-label="Move down" onClick={() => moveStage(i, 1)}>▼</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 min-w-0">
                      <div className="col-span-2 flex gap-2">
                        <input className={FIELD} value={s.label} onChange={(e) => editStage(i, { label: e.target.value })} />
                        <button
                          className="shrink-0 text-faint hover:text-status-negative-text px-1"
                          aria-label="Remove stage"
                          onClick={() => setPStages((rows) => rows.filter((_, k) => k !== i))}
                        >
                          ✕
                        </button>
                      </div>
                      <select className={FIELD} value={s.kind} onChange={(e) => editStage(i, { kind: e.target.value as PlanStageRow["kind"], obligation_id: e.target.value === "obligation" ? s.obligation_id : null })}>
                        <option value="vault">vault threshold</option>
                        <option value="obligation">pay off an obligation</option>
                        <option value="trailer">trade-up fund · vault overflow above the ratchet</option>
                      </select>
                      {s.kind === "obligation" ? (
                        <select className={FIELD} value={s.obligation_id ?? ""} onChange={(e) => editStage(i, { obligation_id: e.target.value || null })}>
                          <option value="">bind an obligation…</option>
                          {obligations.map((o) => (
                            <option key={o.obligation_id} value={o.obligation_id}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex gap-2">
                          <input inputMode="decimal" placeholder="target" className={FIELD} value={s.target_lo ?? ""} onChange={(e) => editStage(i, { target_lo: e.target.value })} />
                          <input inputMode="decimal" placeholder="hi (opt)" className={FIELD} value={s.target_hi ?? ""} onChange={(e) => editStage(i, { target_hi: e.target.value })} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="col-span-2 flex gap-3 flex-wrap items-center">
                  <button
                    className="font-condensed font-semibold text-[12.5px] tracking-[.06em] text-amber-hi hover:text-hot"
                    onClick={() =>
                      setPStages((rows) => [
                        ...rows,
                        { stage_id: `new-${Date.now()}`, plan_id: plan.plan_id, position: rows.length + 1, label: "New stage", kind: "vault", obligation_id: null, target_lo: "", target_hi: "" },
                      ])
                    }
                  >
                    + ADD STAGE
                  </button>
                  <button
                    className="ml-auto font-condensed font-semibold text-[12.5px] tracking-[.06em] text-dim hover:text-ink"
                    disabled={busy}
                    onClick={writeNextYearPlan}
                  >
                    WRITE THE {plan.year + 1} PLAN →
                  </button>
                </div>
                {error && <p className="col-span-2 text-destructive text-sm">{error}</p>}
              </div>
              <div className="flex gap-2 justify-end px-5 pb-5">
                <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline" onClick={() => setShowPlan(false)}>CANCEL</button>
                <button
                  className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
                  style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))" }}
                  disabled={busy}
                  onClick={savePlan}
                >
                  {busy ? "SAVING…" : "SAVE PLAN"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusPage;
