import { useEffect, useMemo, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Link } from "react-router";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useLoads } from "@/hooks/useLoads";
import { getObligations, createObligation, patchObligation } from "@/services/obligationsService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import {
  getPlans, getAccounts, getSnapshots, getOpsChecks, createOpsCheck,
} from "@/services/planService";
import type { PlanRow, AccountRow, SnapshotRow, OpsCheckRow } from "@/services/planService";
import {
  getCashAssumptions, patchCashAssumptions,
  getMonthlyFinancials, upsertMonthlyFinancials,
  getForecastAdjustments, setForecastAdjustment,
} from "@/services/cashflowService";
import type { CashAssumptionsRow, MonthlyFinancialRow } from "@/services/cashflowService";
import { buildForecast, pretaxMargin } from "@/lib/metrics/cashflow";
import { parseFinancialRows, FINANCIAL_COLUMNS } from "@/lib/parseFinancials";
import { dayKey as localDayKey } from "@/lib/perDiem";
import type { Obligation } from "@/types/obligation";
import { getSettlements } from "@/services/settlementsService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import type { MaintenanceService } from "@/types/maintenance";
import { getExpensePeriods } from "@/services/expensesService";
import type { SettlementSummary } from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import {
  deductionBuckets,
  weeklyFuelCost30,
  isFirstOfMonth,
} from "@/lib/metrics/settlements";
import {
  buildCashBoard, fuelForWeek,
  type PeriodColumn, type CashCheck, type MoneyDayMove, type DepositLine,
} from "@/lib/metrics/cashBoard";
import { collectReadings, addDays } from "@/lib/metrics/odometer";
import { payWeekOf, weekLabel, type PayWeek } from "@/lib/metrics/payWeeks";
import { getMoneyDay, monthName, type PlanStageInput } from "@/lib/metrics/planStatus";

const LBL = "font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint";
const FIELD =
  "w-full bg-well border border-hairline rounded-[8px] px-3 py-2 text-[14px] text-ink tabular-nums focus:outline-none focus:border-amber";

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString("en-US")}`;
const moneyCents = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signed = (n: number): string =>
  n === 0 ? "0.00" : `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "2026-11-01" → "Nov ’26"
const monthLabel = (k: string): string => {
  const d = new Date(`${k.slice(0, 10)}T00:00:00Z`);
  return `${d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ’${String(d.getUTCFullYear()).slice(2)}`;
};
const utc = (k: string): Date => new Date(`${k.slice(0, 10)}T00:00:00Z`);
// "Wed Sep 30" — the board's date voice, UTC-anchored (dates are the #1 bug).
const dayFull = (k: string): string =>
  `${utc(k).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${utc(k).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
// "Sep 30"
const md = (k: string): string =>
  utc(k).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayLong = (k: string): string =>
  utc(k).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// A stored settlement day / lag is 0–6, but never index an array on trust.
const wdLong = (n: number): string => WEEKDAY_LONG[((Math.trunc(n) % 7) + 7) % 7];
const isDayKey = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);
const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fills = (n: number): string => `${n} fill${n === 1 ? "" : "s"}`;
const weekSpan = (w: PayWeek): string => `${dayFull(w.start)} – ${dayFull(w.end)}`;

const CashFlowPage = () => {
  const { loads } = useLoads(0);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [assumptions, setAssumptions] = useState<CashAssumptionsRow | null>(null);
  const [financials, setFinancials] = useState<MonthlyFinancialRow[]>([]);
  const [adjustments, setAdjustments] = useState<Map<string, number>>(new Map());
  const [settlementDay, setSettlementDay] = useState<number | null>(null);
  const [depositLag, setDepositLag] = useState<number | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [opsChecks, setOpsChecks] = useState<OpsCheckRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementSummary[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Planning scratch — page-local, not persisted. A typed net pay beats a
  // projection but never the feed's actual; keyed by the STATEMENT date.
  const [netPayOverrides, setNetPayOverrides] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null); // which cell is an input
  const [showPaste, setShowPaste] = useState(false);
  const [showAssume, setShowAssume] = useState(false);
  const [showBills, setShowBills] = useState(false);
  const [showOpsNow, setShowOpsNow] = useState(false);

  const [loadError, setLoadError] = useState(false);

  // allSettled, not all: one flaky call must not throw away the other twelve
  // and render a stocked page as brand-new onboarding.
  const load = () =>
    Promise.allSettled([
      getObligations(), getCashAssumptions(), getMonthlyFinancials(),
      getForecastAdjustments(), getSettlementSchedule(),
      getPlans(), getAccounts(), getSnapshots(),
      getSettlements(), getFuelEntries(),
      getOpsChecks(), getTrips(), getExpensePeriods(),
    ])
      .then(([o, a, f, adj, sched, p, acc, snaps, setl, fuel, oc, tr, per]) => {
        if (setl.status === "fulfilled") setSettlements(setl.value);
        if (fuel.status === "fulfilled") setFuelEntries(fuel.value);
        if (o.status === "fulfilled") setObligations(o.value);
        if (a.status === "fulfilled") setAssumptions(a.value);
        if (f.status === "fulfilled") setFinancials(f.value);
        if (adj.status === "fulfilled")
          setAdjustments(new Map(adj.value.map((r) => [r.month.slice(0, 10), Number(r.weeks_off)])));
        if (sched.status === "fulfilled") {
          setSettlementDay(sched.value?.settlement_day ?? null);
          setDepositLag(sched.value?.deposit_lag_days ?? null);
        }
        if (p.status === "fulfilled") setPlans(p.value);
        if (acc.status === "fulfilled") setAccounts(acc.value);
        if (snaps.status === "fulfilled") setSnapshots(snaps.value);
        if (oc.status === "fulfilled") setOpsChecks(oc.value);
        if (tr.status === "fulfilled") setTrips(tr.value);
        if (per.status === "fulfilled") setPeriods(per.value);
        // The schedule 404s harmlessly for a fresh user — every other failure
        // deserves a visible flag, not a silently emptier page.
        setLoadError(
          [o, a, f, adj, p, acc, snaps, setl, fuel, oc, tr, per].some((r) => r.status === "rejected"),
        );
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const plan = useMemo(() => plans.find((p) => p.active) ?? plans[0] ?? null, [plans]);
  const floatLine = plan ? Number(plan.float_line) : null;

  // The operator's LOCAL calendar day — a US evening is already tomorrow in
  // UTC, which would start the board a day late and drop tonight's drafts.
  const asOfKey = useMemo(() => localDayKey(new Date()), []);
  // Settlement day stays Wednesday and the cash lands Thursday — the lag is a
  // schedule setting, so the board dates deposits settlement + lag.
  const setlDay = settlementDay ?? 3;
  const lag = depositLag ?? 1;

  // Role resolution — the board reads ops (bills draft from it; the vault is
  // protected by design) and maintenance ("already moved"); the money day
  // needs the vault and tax balances too.
  const activeAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);
  const opsAcct = activeAccounts.find((a) => a.role === "ops") ?? null;
  const vaultAcct = activeAccounts.find((a) => a.role === "vault") ?? null;
  const maintAcct = activeAccounts.find((a) => a.role === "maintenance") ?? null;
  const taxAcct = activeAccounts.find((a) => a.role === "tax") ?? null;
  const balanceOf = (sn: SnapshotRow, accountId: string | null | undefined): number | null => {
    if (!accountId) return null;
    const b = sn.balances.find((x) => x.account_id === accountId);
    return b == null ? null : Number(b.balance);
  };

  // Settlement-feed measurements (locked 2026-09-06): fuel = rolling 30d
  // from the fuel log (the cost-per-mile rate runs on 30d as well since
  // 2026-09-16);
  // deductions = two ex-advance buckets over the last 12 settlements. The
  // cash board applies the bucket by each STATEMENT's own calendar position.
  // Hand-set assumptions remain the FALLBACK when a measurement has no data.
  const buckets = useMemo(() => deductionBuckets(settlements), [settlements]);
  const fuel30 = useMemo(() => weeklyFuelCost30(fuelEntries, asOfKey), [fuelEntries, asOfKey]);

  // Every balance the board can be measured against: a Friday snapshot (with
  // the accrual it made and the Maintenance balance that proves whether the
  // move was already taken) and every OPS NOW check.
  const checks: CashCheck[] = useMemo(() => {
    const out: CashCheck[] = [];
    for (const s of snapshots) {
      const bal = balanceOf(s, opsAcct?.account_id);
      if (bal == null) continue; // a snapshot with no Ops balance can't base the board
      out.push({
        date: s.as_of.slice(0, 10),
        balance: bal,
        kind: "snapshot",
        note: s.note,
      });
    }
    for (const c of opsChecks) {
      out.push({
        date: c.as_of.slice(0, 10),
        balance: Number(c.balance),
        kind: "check",
        note: c.note,
      });
    }
    return out;
  }, [snapshots, opsChecks, opsAcct]);

  // Every mile the truck rolls: a reading at every fill, every load's pickup
  // and delivery, and both ends of every trip log (rev 3, issue 8).
  // Shop visits carry the truck's meter too — a fourth source for the chain.
  const [services, setServices] = useState<MaintenanceService[]>([]);
  useEffect(() => {
    getMaintenanceServices().then(setServices).catch(() => {});
  }, []);
  const readings = useMemo(
    () => collectReadings(fuelEntries, loads ?? [], trips, services),
    [fuelEntries, loads, trips, services],
  );

  const perMile = plan ? Number(plan.maintenance_per_mile) : 0;

  // A run money day's outflow: tax off the top plus the surplus that actually
  // moved, on the day of the snapshot that ran it — recomputed by the same
  // function the Plan page uses, never projected before it runs.
  const moneyDays: MoneyDayMove[] = useMemo(() => {
    if (!plan) return [];
    const stages: PlanStageInput[] = plan.stages.map((s) => ({
      stage_id: s.stage_id, position: s.position, label: s.label, kind: s.kind,
      target_lo: s.target_lo, target_hi: s.target_hi, obligation: null,
    }));
    const planInput = {
      float_line: plan.float_line, stages, tax_pct: plan.tax_pct,
      maintenance_floor: plan.maintenance_floor, min_move: plan.min_move,
      objective_pct: plan.objective_pct,
    };
    const out: MoneyDayMove[] = [];
    for (const s of snapshots) {
      const month = s.settles_month ? s.settles_month.slice(0, 10) : null;
      if (!month) continue;
      const period = periods.find((p) => p.period_month.slice(0, 10) === month);
      if (!period || period.income_total == null || period.cogs_total == null || period.expense_total == null) continue;
      const pretax = period.income_total - period.cogs_total - period.expense_total;
      const md = getMoneyDay(
        {
          as_of: s.as_of.slice(0, 10),
          ops: balanceOf(s, opsAcct?.account_id),
          vault: balanceOf(s, vaultAcct?.account_id),
          maintenance: balanceOf(s, maintAcct?.account_id),
          tax: balanceOf(s, taxAcct?.account_id),
        },
        planInput,
        { month, pretaxProfit: pretax },
        (numOrNull(s.miles) ?? 0) * perMile,
        null,
      );
      if (!md) continue;
      out.push({
        date: s.as_of.slice(0, 10),
        amount: md.tax + (md.belowMin ? 0 : md.surplus),
        label: `Money day · ${monthName(month)}`,
      });
    }
    return out;
  }, [plan, snapshots, periods, opsAcct, vaultAcct, maintAcct, taxAcct, perMile]);

  const board = useMemo(() => {
    if (!assumptions) return null;
    return buildCashBoard({
      today: asOfKey,
      settlementDay: setlDay,
      depositLagDays: lag,
      floatLine,
      checks,
      loads: loads ?? [],
      settlements,
      fuelEntries,
      obligations,
      readings,
      weeklyPayroll: Number(assumptions.weekly_payroll),
      perMile,
      fuelPaceWeekly: fuel30,
      fuelFallback: Number(assumptions.weekly_fuel_advance ?? 0),
      advanceDefault: Number(assumptions.weekly_fuel_advance) || 2000,
      buckets,
      deductionsFallback: Number(assumptions.weekly_settlement_deductions ?? 0),
      weeklyRevenueFallback: Number(assumptions.weekly_revenue),
      moneyDays,
      overrides: netPayOverrides,
    });
  }, [
    assumptions, asOfKey, setlDay, lag, floatLine, checks, loads, settlements,
    fuelEntries, obligations, readings, perMile, fuel30, buckets, moneyDays, netPayOverrides,
  ]);

  const showMoneyRow = (board?.columns ?? []).some((c) => c.moneyDays.length > 0);

  const forecast = useMemo(
    () => (assumptions ? buildForecast(financials, assumptions, adjustments) : null),
    [financials, assumptions, adjustments],
  );
  const actualsShown = financials.slice(-6);

  const chartData = useMemo(() => {
    const rows: { m: string; actual: number | null; forecast: number | null }[] =
      actualsShown.map((f) => ({ m: monthLabel(f.month), actual: Number(f.ending_cash), forecast: null }));
    if (forecast) {
      // Seam: the last actual point also anchors the dashed line.
      if (rows.length > 0) rows[rows.length - 1].forecast = rows[rows.length - 1].actual;
      forecast.months.forEach((fm) =>
        rows.push({ m: monthLabel(fm.month), actual: null, forecast: fm.ending }),
      );
    }
    return rows;
  }, [actualsShown, forecast]);

  // Freshness + basis: WHEN the archive last changed and WHICH months feed
  // the baseline — a new import moves the forecast, and the header must say
  // why instead of letting the number jump silently (Jason, 2026-09-01).
  const lastImport = useMemo(() => {
    const ts = financials
      .map((f) => (f.updated_at ? Date.parse(f.updated_at) : NaN))
      .filter((n) => Number.isFinite(n));
    return ts.length ? new Date(Math.max(...ts)) : null;
  }, [financials]);
  const baselineMonths = useMemo(() => {
    const last6 = financials.slice(-6);
    if (last6.length === 0) return null;
    const name = (k: string) =>
      new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return last6.length === 1
      ? name(last6[0].month)
      : `${name(last6[0].month)}–${name(last6[last6.length - 1].month)}`;
  }, [financials]);

  const catchup = assumptions ? Number(assumptions.tax_catchup_owed) : 0;
  const lastForecastEnd = forecast?.months.at(-1)?.ending ?? null;
  // YTD means the LATEST archived year only — the archive is permanent, so an
  // unfiltered sum would quietly blend 2026 into 2027's "year to date".
  const ytdMargin = useMemo(() => {
    if (financials.length === 0) return null;
    const year = financials[financials.length - 1].month.slice(0, 4);
    const inYear = financials.filter((f) => f.month.slice(0, 4) === year);
    const inc = inYear.reduce((s, f) => s + Number(f.total_income), 0);
    const ni = inYear.reduce((s, f) => s + Number(f.net_income), 0);
    return inc > 0 ? ni / inc : null;
  }, [financials]);

  const endTone = (v: number) =>
    floatLine != null && v < floatLine ? "var(--color-warn)" : "var(--color-ok)";

  // The fuel tile's four-week range: the last four CLOSED pay weeks' actual
  // fills, so the volatility Jason named is on the page as numbers.
  const fuelCtx = useMemo(
    () => ({ fuelEntries, today: asOfKey, fuelPaceWeekly: fuel30, fuelFallback: 0, advanceDefault: Number(assumptions?.weekly_fuel_advance) || 2000, settlements, settlementDay: setlDay }),
    [fuelEntries, asOfKey, fuel30, assumptions, settlements, setlDay],
  );
  const fuelWeeks = useMemo(() => {
    const out: { week: PayWeek; amount: number; fills: number }[] = [];
    let w = payWeekOf(asOfKey);
    for (let i = 0; i < 4; i++) {
      w = { start: addDays(w.start, -7), end: addDays(w.end, -7) };
      const f = fuelForWeek(fuelCtx, w);
      out.push({ week: w, amount: f.spent, fills: f.fills });
    }
    return out;
  }, [fuelCtx, asOfKey]);
  const lastPayWeek = fuelWeeks[0] ?? null;
  const thisPayWeekFuel = useMemo(() => fuelForWeek(fuelCtx, payWeekOf(asOfKey)), [fuelCtx, asOfKey]);
  const fourWeekRange = useMemo(() => {
    const amounts = fuelWeeks.slice(0, 4).map((x) => x.amount);
    return amounts.length ? { lo: Math.min(...amounts), hi: Math.max(...amounts) } : null;
  }, [fuelWeeks]);

  if (loading)
    return <div className="text-sm text-muted-text py-12 text-center">Loading the cash picture…</div>;

  // ---- the board's verdict badge ----
  const badgeWord =
    board == null
      ? "NO BALANCE YET"
      : board.clears == null
        ? "NO FLOAT LINE"
        : board.clears
          ? "CLEARS THE FLOAT"
          : "UNDER THE FLOAT — HOLD";
  const badgeTone =
    board?.clears == null
      ? "var(--color-faint, #5a6880)"
      : board.clears
        ? "var(--color-ok)"
        : "var(--color-warn)";

  // The next statement that carries the insurance stack (a 60-day walk, no
  // hook — this sits below the loading return).
  const nextFirstStatement = ((): string | null => {
    let d = asOfKey;
    for (let i = 0; i < 60; i++) {
      if (utc(d).getUTCDay() === setlDay && isFirstOfMonth(d)) return d;
      d = addDays(d, 1);
    }
    return null;
  })();

  // ---- the rows, in Jason's order (2026-10-01) ----
  const revFallback = assumptions ? Number(assumptions.weekly_revenue) : 0;
  const advanceDefault = Number(assumptions?.weekly_fuel_advance) || 2000;
  const wd3 = (n: number): string => wdLong(n).slice(0, 3);
  const inOps = " · already in your Ops number";
  const advanceWords = (d: { advances: number; advancesSource: DepositLine["advancesSource"] }): string =>
    d.advancesSource === "actual"
      ? `advances ${money(d.advances)} (the statement)`
      : d.advancesSource === "fills"
        ? `advance ${money(d.advances)} (the fills passed ${money(advanceDefault)})`
        : d.advancesSource === "none"
          ? "no loads, no advance"
          : `advance ${money(d.advances)} (assumed)`;
  // A deposit that isn't the statement's actual is a figure you can type over.
  const depositFigure = (d: DepositLine, sign = "") =>
    d.source === "actual" ? (
      `${sign}${moneyCents(d.amount)}`
    ) : (
      <>
        {sign}
        <EditCell
          id={`dep-${d.statementDate}`}
          editing={editing}
          setEditing={setEditing}
          value={d.amount}
          prefix="$"
          onCommit={(v) => setNetPayOverrides((p) => ({ ...p, [d.statementDate]: v }))}
        />
        {d.source === "override" && (
          <button
            className="ml-1 text-amber-hi hover:text-hot text-[11px]"
            onClick={() =>
              setNetPayOverrides((p) => {
                const next = { ...p };
                delete next[d.statementDate];
                return next;
              })
            }
          >
            ✕
          </button>
        )}
      </>
    );

  const openingCell = (c: PeriodColumn): CellSpec => {
    if (c.key === "current") {
      const b = board!.base;
      const who = b.kind === "check" ? "Ops now" : utc(b.date).getUTCDay() === 5 ? "Friday snapshot" : "snapshot";
      const rule = b.kind === "check" ? "everything dated on or after it comes off" : "what’s dated after it comes off — the snapshot already holds its own day";
      return {
        headline: moneyCents(b.balance),
        note: `${who} · typed ${dayFull(b.date)} · ${rule}${b.note ? ` · “${b.note}”` : ""}`,
      };
    }
    return { headline: c.opening == null ? "—" : money(c.opening), note: "the current period’s ending, carried over" };
  };

  const prevDepositCell = (c: PeriodColumn): CellSpec => {
    const d = c.prevDeposit;
    if (!d) return { headline: "—", note: c.key === "next" ? "the current period’s deposit lands here — it’s counted in that column" : "nothing lands this period" };
    const stamp = d.source === "actual" ? "ACTUAL" : d.source === "override" ? "YOU SAID" : d.source === "projected" ? "EXPECTED" : null;
    const says = d.source === "actual" ? "actual, from the feed" : d.source === "override" ? `you said ${money(d.amount)}` : `${d.loads} delivered ${money(d.loadsNet)} − ${advanceWords(d)} − bucket ${money(d.bucket)}`;
    return {
      headline: depositFigure(d, "+"),
      stamp,
      tone: d.counted ? "var(--color-ok)" : "var(--color-faint)",
      note: `last period’s (${weekLabel(d.week)}) · statement ${md(d.statementDate)} · ${says} · ${d.date < asOfKey ? "landed" : "lands"} ${dayFull(d.date)}${d.counted ? "" : inOps}`,
    };
  };

  const depositCell = (c: PeriodColumn): CellSpec => {
    const d = c.deposit;
    const stamp = d.source === "actual" ? "ACTUAL" : d.source === "override" ? "YOU SAID" : d.source === "projected" ? "EXPECTED" : null;
    const bucketWord = d.bucketKind === "first" ? "first-of-month bucket" : "bucket";
    const expectedBits = [d.inTransit > 0 ? `${d.inTransit} in transit` : null, d.booked > 0 ? `${d.booked} booked` : null].filter(Boolean);
    const delivered = `${d.loads} delivered${d.loads > 0 ? ` ${money(d.loadsNet)}` : ""}`;
    const expected = expectedBits.length ? ` + ${expectedBits.join(" + ")} expected ${money(d.expectedNet)}` : "";
    const note =
      d.source === "actual"
        ? `statement ${md(d.statementDate)} · actual, from the feed · ${d.date < asOfKey ? "landed" : "lands"} ${dayFull(d.date)}`
        : d.source === "fallback"
          ? `statement ${md(d.statementDate)} · nothing booked yet — the ${money(revFallback)} weekly fallback − ${advanceWords(d)} − ${bucketWord} ${money(d.bucket)} · lands ${dayFull(d.date)}`
          : d.source === "override"
            ? `statement ${md(d.statementDate)} · you said ${money(d.amount)} · the loads say ${money(d.loadsNet + d.expectedNet - d.advances - d.bucket)} (${delivered}${expected} − ${advanceWords(d)} − ${bucketWord} ${money(d.bucket)}) · lands ${dayFull(d.date)}`
            : `statement ${md(d.statementDate)} · ${delivered}${expected} − ${advanceWords(d)} − ${bucketWord} ${money(d.bucket)} · lands ${dayFull(d.date)}`;
    const headline = depositFigure(d);
    return { headline, stamp, note, tone: d.source === "fallback" ? "var(--color-faint)" : undefined };
  };

  const payrollCell = (c: PeriodColumn): CellSpec => ({
    headline: `−${money(c.payroll.amount)}`,
    tone: c.payroll.counted ? undefined : "var(--color-faint)",
    note: `assumption · ${dayFull(c.payroll.date)}${c.payroll.counted ? "" : inOps}`,
  });

  const accrualCell = (c: PeriodColumn): CellSpec => {
    const a = c.accrual;
    if (a.source === "none" && a.amount === 0)
      return { headline: "—", note: `${weekLabel(c.week)} · ${a.words ?? "nothing yet"} · paid ${dayFull(a.date)}` };
    return {
      headline: `−${money(a.amount)}`,
      tone: a.counted ? undefined : "var(--color-faint)",
      note: `${weekLabel(c.week)} · ${a.words} · paid ${dayFull(a.date)}${a.counted ? "" : inOps}`,
      flag: a.flag,
    };
  };

  const fuelCell = (c: PeriodColumn): CellSpec => {
    const f = c.fuel;
    const parts: string[] = [];
    if (c.state === "open") parts.push(f.fills === 0 ? "no fill logged yet" : `${fills(f.fills)} so far ${money(f.soFar)}`, f.spentSource === "pace" ? "running at the 30-day pace" : "actual");
    else parts.push("at the 30-day pace");
    parts.push(advanceWords(f));
    return { headline: money(f.spent), stamp: f.spentSource === "actual" ? "ACTUAL" : "AT PACE", note: parts.join(" · ") };
  };

  const leftoverCell = (c: PeriodColumn): CellSpec => {
    const l = c.fuel.leftover;
    if (c.fuel.advancesSource === "none") return { headline: "—", note: "no loads, no advance — nothing on the card to send back" };
    return {
      headline: `+${money(l.amount)}`,
      tone: l.counted ? "var(--color-ok)" : "var(--color-faint)",
      note: `${money(c.fuel.advances)} advanced − ${money(c.fuel.spent)} spent → business checking ${dayFull(l.date)}${l.counted ? "" : inOps}`,
    };
  };

  // An Ops number older than this Wednesday: what the previous period(s)
  // still owe after it — their accrual, card leftover, bills, a money day —
  // comes off the current column too. Nothing is left in no column.
  const sinceCell = (c: PeriodColumn): CellSpec => {
    if (c.key !== "current" || c.since.length === 0) return { headline: "—", note: null };
    const total = c.since.reduce((sum, p) => sum + p.total, 0);
    const bits = c.since.map((p) => {
      const lines: string[] = [];
      if (p.deposit) lines.push(`deposit +${money(p.deposit.amount)} (${md(p.deposit.date)})`);
      if (p.leftover) lines.push(`card leftover +${money(p.leftover.amount)} (${md(p.leftover.date)})`);
      if (p.payroll) lines.push(`payroll −${money(p.payroll.amount)} (${md(p.payroll.date)})`);
      if (p.accrual) lines.push(`accrual −${money(p.accrual.amount)} (${md(p.accrual.date)})`);
      for (const b of p.bills) lines.push(`${b.label} −${money(b.amount)} (${md(b.date)})`);
      for (const m of p.moneyDays) lines.push(`${m.label} −${money(m.amount)} (${md(m.date)})`);
      return `${weekLabel(p.week)}: ${lines.join(" · ")}`;
    });
    return {
      headline: total === 0 ? "—" : `${total > 0 ? "+" : "−"}${money(Math.abs(total))}`,
      tone: total > 0 ? "var(--color-ok)" : undefined,
      note: bits.join(" · "),
    };
  };

  const billsCell = (c: PeriodColumn): CellSpec => {
    const counted = c.bills.filter((b) => b.counted);
    const already = c.bills.filter((b) => !b.counted);
    const list = (xs: typeof c.bills) => xs.map((b) => `${b.label} ${money(b.amount)} (${Number(b.date.slice(8, 10))})`).join(" · ");
    return {
      headline: c.billsTotal === 0 ? "—" : `−${money(c.billsTotal)}`,
      note: (counted.length ? list(counted) : "nothing drafts this period") + (already.length ? ` · already in your Ops number: ${list(already)}` : ""),
    };
  };

  const moneyDayCell = (c: PeriodColumn): CellSpec => {
    const counted = c.moneyDays.filter((m) => m.counted);
    if (c.moneyDays.length === 0) return { headline: "—", note: null };
    return {
      headline: counted.length ? `−${money(counted.reduce((s, m) => s + m.amount, 0))}` : "—",
      note: c.moneyDays.map((m) => `${m.label} · ${dayFull(m.date)}${m.counted ? "" : inOps}`).join(" · "),
    };
  };

  const endingCell = (c: PeriodColumn): CellSpec => {
    const e = c.ending;
    const under = e != null && floatLine != null && e < floatLine;
    let note = "after this period settles";
    if (floatLine != null && e != null) note += under ? ` · under the ${money(floatLine)} float · hold` : " · clears the float";
    if (c.key === "current") note += " · carries to the next period";
    return { headline: e == null ? "—" : money(e), tone: e == null ? undefined : endTone(e), display: true, note };
  };

  const showSinceRow = (board?.columns[0].since.length ?? 0) > 0;
  const rowSpecs: { label: string; sub?: string; cell: (c: PeriodColumn) => CellSpec }[] = [
    { label: "Ops", sub: "your latest number", cell: openingCell },
    ...(showSinceRow ? [{ label: "Since your number", sub: "what the previous period still owes after it", cell: sinceCell }] : []),
    { label: "Last period’s deposit", sub: `lands the ${wdLong(setlDay + lag)} inside this period`, cell: prevDepositCell },
    { label: "Deposit", sub: `this period’s own · statement ${wd3(setlDay)}, lands ${wd3(setlDay + lag)}`, cell: depositCell },
    { label: "Payroll · Fri", cell: payrollCell },
    { label: "Accrual", sub: "this period’s miles · the Friday after it closes", cell: accrualCell },
    { label: "Fuel · the card", sub: "spent, and the advance borrowed against the loads", cell: fuelCell },
    { label: "Card leftover → Ops", sub: "Monday", cell: leftoverCell },
    { label: "Bills", cell: billsCell },
    ...(showMoneyRow ? [{ label: "Money day", cell: moneyDayCell }] : []),
    { label: "Ending", sub: "Ops after this period settles", cell: endingCell },
  ];
  const rows = board
    ? rowSpecs.map((r) => ({ label: r.label, sub: r.sub, cells: board.columns.map(r.cell) }))
    : [];

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* statusbar */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">CASH FLOW</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the drains, the drafts, and the runway
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowPaste(true)}
              className="font-condensed font-bold text-[11.5px] tracking-[.12em] uppercase text-[#0d1117] bg-amber rounded-[8px] px-3.5 py-[7px] hover:bg-amber-hi"
            >
              Paste months
            </button>
            <button
              onClick={() => setShowAssume(true)}
              className="font-condensed font-semibold text-[11.5px] tracking-[.12em] uppercase text-dim border border-hairline rounded-[8px] px-3 py-[6px] hover:text-ink"
            >
              Assumptions
            </button>
          </span>
        </div>

        {loadError && (
          <p className="mt-3 font-condensed text-[12.5px]" style={{ color: "var(--color-warn)" }}>
            ⚠ some data didn’t load — the boards below may be missing pieces.{" "}
            <button className="underline underline-offset-2" onClick={load}>retry</button>
          </p>
        )}

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="text-[13.5px] text-faint">
            two pay periods, Wednesday to Tuesday — the one you’re running and the next — each the money it earns against what it carries; Ops carries from your latest number
            {ytdMargin != null && (
              <> · YTD pretax margin (QBO) <b className="font-semibold text-ink tabular-nums">{(ytdMargin * 100).toFixed(1)}%</b></>
            )}
          </span>
        </div>

        {/* THE CASH BOARD */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule flex-wrap"
            style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
          >
            <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>
              THE CASH BOARD
            </span>
            <span
              className="font-display text-[15px] tracking-[.04em] rounded-[7px] px-2.5 pt-[3px] pb-[1px] border-2 whitespace-nowrap"
              style={{
                color: badgeTone,
                borderColor: badgeTone,
                background: "rgba(0,0,0,.18)",
                transform: "rotate(-1.2deg)",
              }}
            >
              {badgeWord}
            </span>
            {board && (
              <span className="font-condensed text-[12.5px] text-faint">
                · the lower ending{" "}
                <b className="font-semibold text-ink tabular-nums">
                  {board.lowest != null ? money(board.lowest) : "—"}
                </b>
                {floatLine != null && (
                  <> · float <b className="font-semibold text-ink tabular-nums">{money(floatLine)}</b></>
                )}
                {" · "}settlement {wdLong(setlDay).slice(0, 3)}, cash{" "}
                {wdLong(setlDay + lag).slice(0, 3)}
              </span>
            )}
            <span className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShowOpsNow(true)}
                className="font-condensed font-bold text-[11px] tracking-[.12em] uppercase text-[#0d1117] bg-amber rounded-[8px] px-3 py-[6px] hover:bg-amber-hi"
              >
                Ops now ▸
              </button>
              <button
                onClick={() => setShowBills(true)}
                className="font-condensed font-semibold text-[11px] tracking-[.12em] uppercase text-amber-hi hover:text-hot"
              >
                Edit bills ▸
              </button>
            </span>
          </div>

          {board ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] tabular-nums" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint">
                      <th className="text-left px-4 py-2 border-b border-hairline align-bottom">pay period</th>
                      {board.columns.map((c) => (
                        <th key={c.key} className="text-right px-4 py-2 border-b border-hairline align-bottom">
                          <span className="text-ink">{WEEK_TITLE[c.key]}</span>
                          {c.state === "open" && <BoardStamp>OPEN</BoardStamp>}
                          <span className="block font-condensed text-[11px] text-faint normal-case tracking-normal mt-0.5 whitespace-nowrap">
                            {weekSpan(c.week)}
                            {c.key === "current" && <> · today is {weekdayLong(asOfKey)}</>}
                          </span>
                          <span className="block font-condensed text-[11px] text-faint normal-case tracking-normal whitespace-nowrap">
                            statement {md(c.deposit.statementDate)} · lands {dayFull(c.deposit.date)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td className="text-left px-4 py-2 border-b border-hairline-lo font-condensed text-[13px] text-dim align-top">
                          {r.label}
                          {r.sub && (
                            <span className="block text-[11px] text-faint leading-tight">{r.sub}</span>
                          )}
                        </td>
                        {r.cells.map((c, i) => (
                          <BoardCell key={board.columns[i].key} spec={c} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 pb-3 font-condensed text-[11px] text-faint">
                Each column is one pay period, Wednesday to Tuesday: what it delivers goes on the next Wednesday’s statement and lands Thursday · Ops carries from your latest number, and only what’s dated on or after it comes off — what the previous period still owes after it rides in as SINCE YOUR NUMBER · ENDING turns{" "}
                <span style={{ color: "var(--color-warn)" }}>red</span> under the float
                {floatLine != null && (
                  <> ({money(floatLine)} — the plan’s line, edited on{" "}
                  <Link to="/status" className="text-amber-hi hover:text-hot">Status</Link>)</>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-text px-4 py-6">
              {assumptions == null ? (
                <>
                  Needs your planning assumptions first —{" "}
                  <button className="text-amber-hi hover:text-hot" onClick={() => setShowAssume(true)}>
                    set them up
                  </button>
                  .
                </>
              ) : (
                <>
                  Needs a balance — take a{" "}
                  <Link to="/status" className="text-amber-hi hover:text-hot">Friday snapshot</Link> or type{" "}
                  <button className="text-amber-hi hover:text-hot" onClick={() => setShowOpsNow(true)}>
                    OPS NOW
                  </button>
                  .
                </>
              )}
            </p>
          )}
        </div>

        {/* THE SETTLEMENTS — Landstar's weekly actuals, fed by the server */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule"
            style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
          >
            <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>
              THE SETTLEMENTS
            </span>
            <span className="ml-auto font-condensed text-[12px] text-faint">
              weekly deposits as Landstar actually paid them · every row reconciled to its own statement
            </span>
          </div>
          {settlements.length === 0 ? (
            <p className="px-4 py-6 font-condensed text-sm text-faint">
              No settlements fed yet — the server's parser fills this the moment
              statements flow (and the backfill lights up a year of history).
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] font-condensed" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr className="text-faint text-[10.5px] uppercase tracking-[.1em]">
                      <th className="text-left px-4 py-2">Week ending</th>
                      <th className="text-right px-3 py-2">Loads</th>
                      <th className="text-right px-3 py-2">Revenue</th>
                      <th className="text-right px-3 py-2">Advances</th>
                      <th className="text-right px-3 py-2">Other deductions</th>
                      <th className="text-right px-3 py-2">Net deposit</th>
                      <th className="text-right px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.slice(0, 6).map((s) => {
                      const adv = Number(s.advances);
                      const other = Number(s.deductions) - adv;
                      return (
                        <tr key={s.settlement_id} className="border-t ds2-cell-rule">
                          <td className="px-4 py-2 text-ink font-semibold">
                            <a href={s.server_url} target="_blank" rel="noreferrer" className="hover:text-amber-hi" title="Open the filed statement (tailnet)">
                              {s.period_ending.slice(5)}
                            </a>
                            {isFirstOfMonth(s.period_ending) && (
                              <span className="ml-2 text-[10px] text-faint uppercase">1st of mo</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{s.loads}</td>
                          <td className="px-3 py-2 text-right">{moneyCents(Number(s.revenue))}</td>
                          <td className="px-3 py-2 text-right text-dim">−{moneyCents(adv)}</td>
                          <td className="px-3 py-2 text-right text-dim">−{moneyCents(other)}</td>
                          <td className="px-3 py-2 text-right text-ink font-semibold">{moneyCents(Number(s.net))}</td>
                          <td className="px-4 py-2 text-right">
                            {s.unmatched_loads.length > 0 ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "var(--color-status-negative-bg)", color: "var(--color-status-negative-text)" }} title={`Loads on the statement but not in dash: ${s.unmatched_loads.join(", ")}`}>
                                FIX {s.unmatched_loads.length}
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "var(--color-status-positive-bg)", color: "var(--color-status-positive-text)" }}>
                                ✓
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {settlements[0]?.adjustments.length > 0 && (
                <div className="mx-4 my-3 px-3 py-2 rounded-[9px] border font-condensed text-[12.5px]" style={{ borderColor: "rgba(232,148,10,.35)", background: "var(--color-well, #090d15)" }}>
                  <span className="text-amber-hi font-semibold uppercase text-[10.5px] tracking-[.08em]">
                    Adjustments · week of {settlements[0].period_ending.slice(5)}
                  </span>{" "}
                  <span className="text-dim">— Landstar reached back into paid loads:</span>{" "}
                  {settlements[0].adjustments.map((a, i) => (
                    <span key={i} className="text-ink">
                      {i > 0 && " · "}
                      {a.load_id ? (
                        <Link to={`/loads/${a.load_id}`} className="text-amber-light hover:underline">{a.load_number}</Link>
                      ) : (
                        a.load_number ?? "—"
                      )}{" "}
                      {(a.description ?? "adjustment").toLowerCase()}{" "}
                      <span className={Number(a.amount) < 0 ? "text-hot" : "text-dim"}>
                        {moneyCents(Number(a.amount))}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 pb-4 pt-1">
                <div className="ds2-well rounded-[10px] px-3.5 py-3">
                  <p className="text-[10.5px] uppercase tracking-[.12em] text-faint font-condensed">Fuel · 30-day pace</p>
                  <p className="font-display text-[24px] text-amber-hi mt-1">
                    {fuel30 != null ? `${money(fuel30)}/wk` : "no fuel log data"}
                  </p>
                  <p className="font-condensed text-[11.5px] text-faint mt-1 leading-snug">
                    {lastPayWeek && (
                      <>last week <b className="text-dim tabular-nums">{money(lastPayWeek.amount)}</b> actual ({fills(lastPayWeek.fills)}) · </>
                    )}
                    this week <b className="text-dim tabular-nums">{money(thisPayWeekFuel.soFar)}</b> so far
                    {fourWeekRange && (
                      <> · four weeks <b className="text-dim tabular-nums">{money(fourWeekRange.lo)}–{money(fourWeekRange.hi)}</b></>
                    )}
                    {" · "}on the pay week’s own {wdLong(setlDay)} statement, cash{" "}
                    {wdLong(setlDay + lag)}
                  </p>
                </div>
                <div className="ds2-well rounded-[10px] px-3.5 py-3">
                  <p className="text-[10.5px] uppercase tracking-[.12em] text-faint font-condensed">Deductions · two buckets · ex-advances</p>
                  <p className="font-display text-[24px] text-amber-hi mt-1">
                    {buckets.standard != null ? money(buckets.standard) : "—"}
                    <span className="text-[15px] text-faint"> · </span>
                    {buckets.firstOfMonth != null ? money(buckets.firstOfMonth) : "—"}
                  </p>
                  <p className="font-condensed text-[11.5px] text-faint mt-1 leading-snug">
                    standard · first statement of the month (insurance)
                    {nextFirstStatement && <> · next first-of-month: <b className="text-dim">{md(nextFirstStatement)}</b></>}
                  </p>
                </div>
                <div className="ds2-well rounded-[10px] px-3.5 py-3">
                  <p className="text-[10.5px] uppercase tracking-[.12em] text-faint font-condensed">Escrow balances</p>
                  <p className="font-display text-[24px] mt-1" style={{ color: "#4f8cd6" }}>
                    {settlements[0]?.escrow_tractor == null && settlements[0]?.escrow_trailer == null
                      ? "—"
                      : moneyCents(Number(settlements[0]?.escrow_tractor ?? 0) + Number(settlements[0]?.escrow_trailer ?? 0))}
                  </p>
                  <p className="font-condensed text-[11.5px] text-faint mt-1 leading-snug">
                    tractor {settlements[0]?.escrow_tractor == null ? "—" : moneyCents(Number(settlements[0].escrow_tractor))} · trailer {settlements[0]?.escrow_trailer == null ? "—" : moneyCents(Number(settlements[0].escrow_trailer))} — Landstar's hold that's still yours
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* THE SIX-MONTH ROAD */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule"
            style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
          >
            <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>
              THE SIX-MONTH ROAD
            </span>
            <span className="ml-auto font-condensed text-[12px] text-faint">
              {financials.length > 0 ? (
                <>
                  last {actualsShown.length} actual months + 6 forecast · baseline{" "}
                  <b className="text-dim tabular-nums">{forecast ? moneyCents(forecast.baseline) : "—"}</b>/mo
                  {baselineMonths && <> · avg of {baselineMonths} net</>}
                  {lastImport && (
                    <>
                      {" "}·{" "}
                      <b className="text-dim">
                        updated {lastImport.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {", "}
                        {lastImport.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </b>
                    </>
                  )}
                </>
              ) : (
                "forges after your first PASTE MONTHS import"
              )}
            </span>
          </div>

          {forecast && chartData.length > 0 ? (
            <>
              <div className="px-2 pt-3" style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#141c2a" vertical={false} />
                    <XAxis dataKey="m" tick={{ fill: "#5a6880", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1e2636" }} />
                    <YAxis
                      tick={{ fill: "#5a6880", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0e1420", border: "1px solid #1e2636", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#93a1b8" }}
                      // Match the library's wide signature; coerce inside.
                      formatter={(v, name) => {
                        const n = Number(v);
                        const label = name === "actual" ? "ending (actual)" : "ending (forecast)";
                        return Number.isFinite(n) ? [moneyCents(n), label] : ["—", label];
                      }}
                    />
                    {floatLine != null && (
                      <ReferenceLine
                        y={floatLine}
                        stroke="var(--color-warn)"
                        strokeDasharray="2 4"
                        label={{ value: `float ${money(floatLine)}`, position: "insideBottomRight", fill: "var(--color-warn)", fontSize: 10.5 }}
                      />
                    )}
                    <Line type="monotone" dataKey="actual" stroke="#f5b03a" strokeWidth={2} dot={{ r: 3, fill: "#f5b03a" }} connectNulls={false} />
                    <Line type="monotone" dataKey="forecast" stroke="#f5b03a" strokeWidth={2} strokeDasharray="6 5" strokeOpacity={0.85} dot={{ r: 3, fill: "#f5b03a", fillOpacity: 0.85 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[13px] tabular-nums" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="font-condensed text-[11px] tracking-[.1em] uppercase text-faint">
                      {["Month", "Net income", "Pretax margin", "+ Depreciation", "Financing", "Income tax", "Net change", "Ending", "Wks off"].map((h, i) => (
                        <th key={h} className={`${i === 0 ? "text-left" : "text-right"} px-3.5 py-2 border-b border-hairline whitespace-nowrap`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {actualsShown.map((f) => {
                      const margin = pretaxMargin(f);
                      const change = Number(f.ending_cash) - Number(f.beginning_cash);
                      return (
                        <tr key={f.month} className="text-ink">
                          <td className="text-left px-3.5 py-1.5 border-b border-hairline-lo">{monthLabel(f.month)}</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(Number(f.net_income))}</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{margin != null ? `${(margin * 100).toFixed(1)}%` : "—"}</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo text-faint">in NI</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(Number(f.financing))}</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo text-faint">—</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(change)}</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{moneyCents(Number(f.ending_cash))}</td>
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo text-faint">—</td>
                        </tr>
                      );
                    })}
                    {forecast.months.map((fm) => (
                      <tr key={fm.month} className="text-dim">
                        <td className="text-left px-3.5 py-1.5 border-b border-hairline-lo">
                          {monthLabel(fm.month)} <span className="text-faint">◦</span>
                          {fm.weeksOff > 0 && (
                            <span className="ml-2 font-condensed text-[10px] font-semibold tracking-[.06em] px-[7px] rounded-full border" style={{ color: "var(--color-blue)", borderColor: "rgba(79,140,214,.45)" }}>
                              {fm.weeksOff} wk home
                            </span>
                          )}
                        </td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(fm.netIncome)}</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo text-faint">—</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(fm.opAdjustments)}</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(fm.financing)}</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(fm.incomeTax)}</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{signed(fm.netChange)}</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">{moneyCents(fm.ending)}</td>
                        <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo">
                          <input
                            // Key on the saved value: a failed save's reload
                            // snaps the input back instead of showing a number
                            // the row's math never took.
                            key={`${fm.month}:${fm.weeksOff}`}
                            type="number"
                            min={0}
                            max={5}
                            step={0.5}
                            className="w-14 bg-well border border-hairline rounded-[6px] px-1.5 py-0.5 text-right text-[12px] text-ink focus:outline-none focus:border-amber"
                            defaultValue={fm.weeksOff}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              // 0–5: a month only holds ~4.5 weeks; typed values ignore HTML max.
                              if (Number.isFinite(v) && v >= 0 && v <= 5 && v !== fm.weeksOff) {
                                setForecastAdjustment(fm.month, v)
                                  .then(() => getForecastAdjustments())
                                  .then((adj) => setAdjustments(new Map(adj.map((r) => [r.month.slice(0, 10), Number(r.weeks_off)]))))
                                  .catch(() =>
                                    getForecastAdjustments()
                                      .then((adj) => setAdjustments(new Map(adj.map((r) => [r.month.slice(0, 10), Number(r.weeks_off)]))))
                                      .catch(() => {}),
                                  );
                              }
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {lastForecastEnd != null && (
                <div className="mx-4 my-3 rounded-[8px] px-3.5 py-2.5 font-condensed text-[12.5px] text-dim" style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}>
                  💰 <b className="text-ink tabular-nums">true spendable ≈ {money(lastForecastEnd - catchup)}</b>
                  {" — "}{monthLabel(forecast.months.at(-1)!.month)} ending {money(lastForecastEnd)} −{" "}
                  <b className="text-ink">{money(catchup)}</b> tax catch-up earmark · forecast = 6-actual average
                  net income − home-time weeks, depreciation added back, financing floor and taxes out
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-text px-4 py-6">
              Forges after your first import — PASTE MONTHS up top takes rows straight from your QBO
              worksheet and previews every month before anything commits.
            </p>
          )}
        </div>

        {showOpsNow && (
          <OpsNowPopup
            today={asOfKey}
            base={board?.base ?? null}
            onClose={() => setShowOpsNow(false)}
            onSaved={() => {
              setShowOpsNow(false);
              load();
            }}
          />
        )}
        {showBills && (
          <BillsPopup
            obligations={obligations}
            onClose={() => setShowBills(false)}
            onChanged={load}
          />
        )}
        {showPaste && (
          <PastePopup
            onClose={() => setShowPaste(false)}
            onCommitted={() => {
              setShowPaste(false);
              load();
            }}
          />
        )}
        {showAssume && (
          <AssumptionsPopup
            assumptions={assumptions}
            floatLine={floatLine}
            onClose={() => setShowAssume(false)}
            onSaved={() => {
              setShowAssume(false);
              load();
            }}
          />
        )}
      </div>
    </div>
  );
};

// ---- the cash board's cells ----

const WEEK_TITLE: Record<PeriodColumn["key"], string> = {
  current: "Current period",
  next: "Next period",
};

interface CellSpec {
  headline: React.ReactNode;
  stamp?: string | null;
  note?: string | null;
  tone?: string;
  display?: boolean; // the Ending row's display-size figure
  flag?: string | null; // the one thing wrong with the figure — amber, under the note
}

// The little rotated stamps: OPEN · ACTUAL · YOU SAID · EXPECTED · AT PACE.
const BoardStamp = ({ children }: { children: string }) => (
  <span
    className="ml-1.5 font-forge text-[9.5px] tracking-[.12em] rounded-[4px] px-[5px] py-[1px] inline-block rotate-[-2deg] align-middle"
    style={{ color: "var(--color-amber-hi)", border: "1.5px solid var(--color-amber-hi)" }}
  >
    {children}
  </span>
);

const BoardCell = ({ spec }: { spec: CellSpec }) => (
  <td className="text-right px-4 py-2 border-b border-hairline-lo align-top">
    <div className="whitespace-nowrap">
      <span
        className={spec.display ? "font-display text-[22px] tracking-[.03em]" : "font-semibold"}
        style={spec.tone ? { color: spec.tone } : undefined}
      >
        {spec.headline}
      </span>
      {spec.stamp && <BoardStamp>{spec.stamp}</BoardStamp>}
    </div>
    {spec.note && (
      <div className="font-condensed text-[11px] text-faint leading-[1.35] whitespace-normal mt-0.5 max-w-[290px] ml-auto">
        {spec.note}
      </div>
    )}
    {spec.flag && (
      <div className="font-condensed text-[11px] text-amber-hi leading-[1.35] whitespace-normal mt-0.5 max-w-[290px] ml-auto">
        {spec.flag}
      </div>
    )}
  </td>
);

const EditCell = ({
  id, editing, setEditing, value, onCommit, prefix = "",
}: {
  id: string;
  editing: string | null;
  setEditing: (v: string | null) => void;
  value: number;
  onCommit: (v: number) => void;
  prefix?: string;
}) => {
  if (editing === id) {
    const original = Math.round(value * 100) / 100;
    return (
      <input
        autoFocus
        type="number"
        step="0.01"
        defaultValue={original}
        className="w-28 bg-well border border-amber rounded-[6px] px-2 py-0.5 text-right text-[13px] text-ink focus:outline-none"
        onBlur={(e) => {
          const v = Number(e.target.value);
          // Tap-to-look must not freeze an override — only a CHANGED value commits.
          if (Number.isFinite(v) && v !== original) onCommit(v);
          setEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(null);
        }}
      />
    );
  }
  return (
    <button className="hover:underline decoration-dotted underline-offset-4 tabular-nums" onClick={() => setEditing(id)} title="tap to override">
      {prefix}
      {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </button>
  );
};

// The draft-calendar editor — every active bill with its category, draft day,
// and FULL draft amount. Loan rows also expose the break-even (principal)
// amount the Expenses math reads; for P&L bills the two are the same number,
// kept equal on save. New bills: loan/lease → off-P&L, everything else is
// already a P&L expense (on_pl = true) so break-even never double-counts.
const BillsPopup = ({
  obligations, onClose, onChanged,
}: {
  obligations: Obligation[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { day: string; amount: string; category: string }>>({});
  const [newBill, setNewBill] = useState({ label: "", amount: "", principal: "", day: "", category: "other" });

  const bills = obligations
    .filter((o) => o.active && o.day_of_month != null)
    .sort((a, b) => (a.day_of_month ?? 0) - (b.day_of_month ?? 0));

  const rowState = (o: Obligation) =>
    draft[o.obligation_id] ?? {
      day: String(o.day_of_month ?? ""),
      amount: String(o.draft_amount ?? o.amount),
      category: o.category,
    };
  const setRow = (id: string, patch: Partial<{ day: string; amount: string; category: string }>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? rowState(bills.find((b) => b.obligation_id === id)!)), ...patch } }));

  const saveRow = async (o: Obligation) => {
    const st = rowState(o);
    const day = Number(st.day);
    const amount = Number(st.amount);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setErr(`${o.label}: draft day must be 1–31`);
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setErr(`${o.label}: bad draft amount`);
      return;
    }
    // on_pl FOLLOWS the category, on every save — a bill recategorized to
    // loan/lease must join break-even (with its principal), and one moved off
    // loan/lease must leave it, or the one-bill-list contract breaks.
    const on_pl = st.category !== "loan_lease";
    setBusy(true);
    setErr(null);
    try {
      await patchObligation(o.obligation_id, {
        category: st.category as Obligation["category"],
        day_of_month: day,
        draft_amount: amount,
        on_pl,
        // P&L bills keep ONE number. A row that just BECAME a loan keeps its
        // old amount as the principal until Jason sets the real split.
        ...(on_pl ? { amount } : {}),
      });
      setDraft((prev) => {
        const next = { ...prev };
        delete next[o.obligation_id];
        return next;
      });
      onChanged();
    } catch {
      setErr(`${o.label}: save failed — the server kept the old values`);
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (o: Obligation) => {
    setBusy(true);
    setErr(null);
    try {
      // Calendar-only removal: the obligation stays ACTIVE (break-even and
      // payoff trackers keep it) — it just stops drafting here. Deactivating
      // belongs to the Expenses card, where its other roles are visible.
      await patchObligation(o.obligation_id, { day_of_month: null });
      onChanged();
    } catch {
      setErr(`${o.label}: remove failed`);
    } finally {
      setBusy(false);
    }
  };

  const addBill = async () => {
    const day = Number(newBill.day);
    const amount = Number(newBill.amount);
    const isLoan = newBill.category === "loan_lease";
    const principal = isLoan ? Number(newBill.principal) : amount;
    if (!newBill.label || !Number.isFinite(day) || day < 1 || day > 31 || !Number.isFinite(amount) || amount < 0) {
      setErr("New bill needs a name, a day 1–31, and a draft amount");
      return;
    }
    if (isLoan && (!Number.isFinite(principal) || principal < 0)) {
      // A loan's interest is already on the P&L — break-even takes only the
      // principal slice, so a new loan must say what that slice is.
      setErr("A loan/lease bill needs its principal (the break-even share)");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createObligation({
        label: newBill.label,
        amount: principal,
        category: newBill.category as Obligation["category"],
        day_of_month: day,
        draft_amount: amount,
        on_pl: !isLoan,
      });
      setNewBill({ label: "", amount: "", principal: "", day: "", category: "other" });
      onChanged();
    } catch {
      setErr("Add failed — nothing was created");
    } finally {
      setBusy(false);
    }
  };

  const SEL = "bg-well border border-hairline rounded-[6px] px-1.5 py-1 text-[12px] text-ink focus:outline-none focus:border-amber";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
          <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>THE BILLS</span>
          <span className="font-condensed text-[11px] text-faint tracking-[.06em] uppercase">what drafts, and when</span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <table className="w-full text-[13px] tabular-nums" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="font-condensed text-[10.5px] tracking-[.08em] uppercase text-faint">
                <th className="text-left px-1 py-1 border-b border-hairline">Bill</th>
                <th className="text-left px-1 py-1 border-b border-hairline">Category</th>
                <th className="text-right px-1 py-1 border-b border-hairline">Day</th>
                <th className="text-right px-1 py-1 border-b border-hairline">Draft $</th>
                <th className="px-1 py-1 border-b border-hairline"></th>
              </tr>
            </thead>
            <tbody>
              {bills.map((o) => {
                const st = rowState(o);
                return (
                  <tr key={o.obligation_id}>
                    <td className="text-left px-1 py-1.5 border-b border-hairline-lo">
                      {o.label}
                      {!o.on_pl && (
                        <span className="ml-1.5 font-condensed text-[9.5px] text-faint uppercase tracking-[.06em]" title="break-even reads the principal amount, not this draft">
                          principal {moneyCents(o.amount)}
                        </span>
                      )}
                    </td>
                    <td className="text-left px-1 py-1.5 border-b border-hairline-lo">
                      <select className={SEL} value={st.category} onChange={(e) => setRow(o.obligation_id, { category: e.target.value })}>
                        <option value="loan_lease">loan / lease</option>
                        <option value="insurance">insurance</option>
                        <option value="other">other</option>
                      </select>
                    </td>
                    <td className="text-right px-1 py-1.5 border-b border-hairline-lo">
                      <input className={`${SEL} w-12 text-right`} type="number" min={1} max={31} value={st.day} onChange={(e) => setRow(o.obligation_id, { day: e.target.value })} />
                    </td>
                    <td className="text-right px-1 py-1.5 border-b border-hairline-lo">
                      <input className={`${SEL} w-24 text-right`} type="number" step="0.01" value={st.amount} onChange={(e) => setRow(o.obligation_id, { amount: e.target.value })} />
                    </td>
                    <td className="text-right px-1 py-1.5 border-b border-hairline-lo whitespace-nowrap">
                      <button disabled={busy} className="text-amber-hi hover:text-hot font-condensed text-[11px] uppercase tracking-[.08em] mr-2" onClick={() => saveRow(o)}>save</button>
                      <button disabled={busy} className="text-faint hover:text-warn" title="remove from the draft calendar — stays active for break-even/payoff" onClick={() => removeRow(o)}>✕</button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="px-1 py-2">
                  <input className={`${SEL} w-full`} placeholder="new bill" value={newBill.label} onChange={(e) => setNewBill((p) => ({ ...p, label: e.target.value }))} />
                </td>
                <td className="px-1 py-2">
                  <select className={SEL} value={newBill.category} onChange={(e) => setNewBill((p) => ({ ...p, category: e.target.value }))}>
                    <option value="loan_lease">loan / lease</option>
                    <option value="insurance">insurance</option>
                    <option value="other">other</option>
                  </select>
                </td>
                <td className="text-right px-1 py-2">
                  <input className={`${SEL} w-12 text-right`} type="number" min={1} max={31} placeholder="day" value={newBill.day} onChange={(e) => setNewBill((p) => ({ ...p, day: e.target.value }))} />
                </td>
                <td className="text-right px-1 py-2">
                  <input className={`${SEL} w-24 text-right`} type="number" step="0.01" placeholder="draft" title="the full bank draft" value={newBill.amount} onChange={(e) => setNewBill((p) => ({ ...p, amount: e.target.value }))} />
                  {newBill.category === "loan_lease" && (
                    <input className={`${SEL} w-24 text-right mt-1`} type="number" step="0.01" placeholder="principal" title="break-even share — interest is already on the P&L" value={newBill.principal} onChange={(e) => setNewBill((p) => ({ ...p, principal: e.target.value }))} />
                  )}
                </td>
                <td className="text-right px-1 py-2">
                  <button disabled={busy} className="text-amber-hi hover:text-hot font-condensed text-[11px] uppercase tracking-[.08em]" onClick={addBill}>+ add</button>
                </td>
              </tr>
            </tbody>
          </table>
          {err && <p className="font-condensed text-[12px] mt-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <p className="font-condensed text-[11px] text-faint mt-3 leading-[1.5]">
            Loan/lease rows: the draft is the FULL bank payment — the break-even principal amount
            stays separate (shown in the chip, edited on{" "}
            <Link to="/expenses" className="text-amber-hi hover:text-hot">Expenses</Link>). ✕ removes a bill
            from the calendar only — it stays active for break-even and payoff tracking.
          </p>
        </div>
      </div>
    </div>
  );
};

const PastePopup = ({ onClose, onCommitted }: { onClose: () => void; onCommitted: () => void }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parsed = useMemo(() => parseFinancialRows(text), [text]);
  const good = parsed.filter((p) => p.row != null);
  const bad = parsed.filter((p) => p.error != null);

  const commit = async () => {
    if (good.length === 0 || bad.length > 0) return;
    setBusy(true);
    setErr(null);
    try {
      await upsertMonthlyFinancials(good.map((g) => g.row!));
      onCommitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[680px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
          <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>PASTE MONTHS</span>
          <span className="font-condensed text-[11px] text-faint tracking-[.06em] uppercase">one row per month, straight from the QBO worksheet</span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <div className="font-mono text-[10.5px] rounded-[6px] px-2.5 py-2 overflow-x-auto whitespace-nowrap" style={{ color: "var(--color-amber-hi)", background: "var(--color-well)", border: "1px dashed rgba(232,148,10,.35)" }}>
            {FINANCIAL_COLUMNS.join(" · ")}
          </div>
          <textarea
            className="w-full mt-3 bg-well border border-hairline rounded-[8px] px-3 py-2 text-[12px] font-mono text-ink min-h-[110px] focus:outline-none focus:border-amber"
            placeholder={"2026-07\t33552.45\t6521.97\t…  (tab or comma separated; header row ok; re-pasting a month updates it)"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {parsed.length > 0 && (
            <table className="w-full mt-3 text-[12px] tabular-nums" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="font-condensed text-[10px] tracking-[.08em] uppercase text-faint">
                  <th className="text-left px-2 py-1 border-b border-hairline">Month</th>
                  <th className="text-right px-2 py-1 border-b border-hairline">Net income</th>
                  <th className="text-right px-2 py-1 border-b border-hairline">Ending cash</th>
                  <th className="text-left px-2 py-1 border-b border-hairline">Check</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((p, i) => (
                  <tr key={i}>
                    <td className="text-left px-2 py-1 border-b border-hairline-lo">{p.row ? p.row.month.slice(0, 7) : "—"}</td>
                    <td className="text-right px-2 py-1 border-b border-hairline-lo">{p.row ? p.row.net_income : "—"}</td>
                    <td className="text-right px-2 py-1 border-b border-hairline-lo">{p.row ? p.row.ending_cash : "—"}</td>
                    <td className="text-left px-2 py-1 border-b border-hairline-lo" style={{ color: p.error ? "var(--color-warn)" : "var(--color-ok)" }}>
                      {p.error ? `⚠ ${p.error}` : "✓ reconciles"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {err && <p className="text-[12px] mt-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <div className="flex items-center gap-2 mt-4">
            <button
              disabled={busy || good.length === 0 || bad.length > 0}
              onClick={commit}
              className="font-condensed font-bold text-[12px] tracking-[.12em] uppercase text-[#0d1117] bg-amber rounded-[8px] px-4 py-2 disabled:opacity-40"
            >
              {busy ? "Committing…" : `Commit ${good.length} month${good.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={onClose} className="font-condensed font-semibold text-[12px] tracking-[.12em] uppercase text-faint border border-hairline rounded-[8px] px-3.5 py-2 hover:text-ink">
              Cancel
            </button>
            {bad.length > 0 && (
              <span className="font-condensed text-[11.5px]" style={{ color: "var(--color-warn)" }}>
                fix {bad.length} flagged row{bad.length === 1 ? "" : "s"} first — the archive never takes half a paste
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AssumptionsPopup = ({
  assumptions, floatLine, onClose, onSaved,
}: {
  // null = no row yet (fresh user) — saving creates it, so the popup must
  // open either way or the page can never bootstrap.
  assumptions: CashAssumptionsRow | null;
  floatLine: number | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [f, setF] = useState({
    weekly_revenue: assumptions?.weekly_revenue ?? "",
    weekly_payroll: assumptions?.weekly_payroll ?? "",
    monthly_depreciation: assumptions?.monthly_depreciation ?? "",
    fed_tax_rate: assumptions?.fed_tax_rate ?? "",
    state_tax_rate: assumptions?.state_tax_rate ?? "",
    financing_floor: assumptions?.financing_floor ?? "",
    tax_catchup_owed: assumptions?.tax_catchup_owed ?? "",
    weekly_fuel_advance: assumptions?.weekly_fuel_advance ?? "",
    weekly_settlement_deductions: assumptions?.weekly_settlement_deductions ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    // A cleared field is "leave it alone", never "set it to 0" — Number("")
    // is 0 and a zeroed payroll or financing floor lies loudly downstream.
    const patch = Object.fromEntries(
      Object.entries(f)
        .filter(([, v]) => String(v).trim() !== "" && Number.isFinite(Number(v)))
        .map(([k, v]) => [k, Number(v)]),
    ) as Partial<Record<keyof CashAssumptionsRow, number>>;
    if (Object.keys(patch).length === 0) {
      setErr("Nothing to save — every field is empty.");
      return;
    }
    // The two holdback fields are withholdings — a negative would ADD phantom
    // cash to every projected week (the lib clamps too, but say it out loud).
    for (const k of ["weekly_fuel_advance", "weekly_settlement_deductions"] as const) {
      if (patch[k] != null && patch[k]! < 0) {
        setErr("Holdback fields can't be negative — they're withheld FROM the settlement.");
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      await patchCashAssumptions(patch);
      onSaved();
    } catch {
      setErr("Save failed — nothing was changed. Try again.");
      setBusy(false);
    }
  };

  const FIELDS: { key: keyof typeof f; label: string }[] = [
    { key: "weekly_revenue", label: "Weekly revenue fallback (pre-holdback net)" },
    { key: "weekly_payroll", label: "Weekly payroll" },
    { key: "monthly_depreciation", label: "Monthly depreciation (add-back)" },
    { key: "fed_tax_rate", label: "Federal tax rate (0–1)" },
    { key: "state_tax_rate", label: "State tax rate (0–1)" },
    { key: "financing_floor", label: "Financing floor (principal / mo, negative)" },
    { key: "tax_catchup_owed", label: "Tax catch-up earmark" },
    { key: "weekly_fuel_advance", label: "Weekly fuel advance (held from settlements)" },
    { key: "weekly_settlement_deductions", label: "Avg weekly settlement deductions" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[460px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
          <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>ASSUMPTIONS</span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="mb-3">
              <label className={LBL}>{label}</label>
              <input type="number" step="0.01" className={FIELD} value={f[key]} onChange={set(key)} />
            </div>
          ))}
          {err && <p className="text-[12px] mb-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <p className="font-condensed text-[11.5px] text-faint leading-[1.5]">
            The red line on both boards is the plan’s float{floatLine != null && <> ({money(floatLine)})</>} — edited on{" "}
            <Link to="/status" className="text-amber-hi hover:text-hot">Status</Link>, not here. Bills live with your
            obligations on <Link to="/expenses" className="text-amber-hi hover:text-hot">Expenses</Link>: category, draft
            day, and full draft amount; loan rows keep a separate break-even (principal) amount so nothing double-counts.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <button disabled={busy} onClick={save} className="font-condensed font-bold text-[12px] tracking-[.12em] uppercase text-[#0d1117] bg-amber rounded-[8px] px-4 py-2 disabled:opacity-40">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="font-condensed font-semibold text-[12px] tracking-[.12em] uppercase text-faint border border-hairline rounded-[8px] px-3.5 py-2 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// OPS NOW: the bank's Ops balance typed any morning, kept as a check. The
// board opens its current column on the latest one; everything dated on or
// after it comes off. The note is where you name what the bank knows and dash
// doesn't (a card charge, a transfer) — it prints on the Ops cell.
const OpsNowPopup = ({
  today, base, onClose, onSaved,
}: {
  today: string;
  base: CashCheck | null; // the number the board opens on today
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [asOf, setAsOf] = useState(today);
  const [balance, setBalance] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const typed = Number(balance);
  const dayKey = isDayKey(asOf.slice(0, 10)) ? asOf.slice(0, 10) : null;
  // A balance can only be from a day that has already happened: the board
  // opens on it and takes off everything dated on or after it.
  const future = dayKey != null && dayKey > today;
  const older = dayKey != null && base != null && dayKey < base.date;
  const save = async () => {
    if (!dayKey) {
      setErr("Pick the day the balance is from.");
      return;
    }
    if (dayKey > today) {
      setErr(`A balance can only be from today or earlier — ${md(today)} or before.`);
      return;
    }
    if (!Number.isFinite(typed) || balance.trim() === "") {
      setErr("Type the Ops balance the bank shows.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createOpsCheck({ as_of: dayKey, balance: typed, note: note.trim() || null });
      onSaved();
    } catch {
      setErr("Save failed — nothing was recorded. Try again.");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[460px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
          <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>OPS NOW</span>
          <span className="font-condensed text-[11px] text-faint tracking-[.06em] uppercase">
            the bank’s ops balance this morning
          </span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <div className="mb-3">
            <label className={LBL} htmlFor="opsnow-asof">As of</label>
            <input id="opsnow-asof" type="date" className={FIELD} value={asOf} max={today} onChange={(e) => { setAsOf(e.target.value); setErr(null); }} />
          </div>
          <div className="mb-3">
            <label className={LBL} htmlFor="opsnow-balance">Ops balance</label>
            <input id="opsnow-balance" inputMode="decimal" placeholder="0.00" className={FIELD} value={balance} onChange={(e) => { setBalance(e.target.value); setErr(null); }} />
          </div>
          <div className="mb-3">
            <label className={LBL} htmlFor="opsnow-note">Note · optional</label>
            <input id="opsnow-note" className={FIELD} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="before Friday’s payroll and the sweep" />
          </div>
          <p className="font-condensed text-[12px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-2">
            {dayKey == null ? (
              <>pick the day the balance is from</>
            ) : future ? (
              <>{md(dayKey)} hasn’t happened yet — pick today or earlier</>
            ) : older ? (
              <>earlier than the board’s current number ({md(base!.date)}) — this will be stored, but the board keeps the newer one</>
            ) : (
              <>
                this becomes the board’s Ops number from {md(dayKey)} — everything dated on or after it comes off
                {base && <>; it replaces the {md(base.date)} {base.kind === "check" ? "check" : "snapshot"} ({money(base.balance)})</>}
              </>
            )}
          </p>
          {err && <p className="mt-2 text-destructive text-sm">{err}</p>}
        </div>
        <div className="flex gap-2 justify-end px-5 pb-5">
          <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline" onClick={onClose}>CANCEL</button>
          <button
            className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
            style={{ background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))" }}
            disabled={busy || future}
            onClick={save}
          >
            {busy ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CashFlowPage;
