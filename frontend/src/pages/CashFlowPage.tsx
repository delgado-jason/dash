import { useEffect, useMemo, useState, useCallback } from "react";
import { FetchFailed } from "@/components/integrity/FetchFailed";
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
  getDepositOverrides, setDepositOverride, deleteDepositOverride,
} from "@/services/cashflowService";
import type { CashAssumptionsRow, MonthlyFinancialRow } from "@/services/cashflowService";
import { buildForecast, pretaxMargin, archiveGaps } from "@/lib/metrics/cashflow";
import { weeksOffByMonth, weeksOffIsDerived } from "@/lib/metrics/homePlan";
import { AssumptionCheck } from "@/components/cashflow/AssumptionCheck";
import { parseFinancialRows, FINANCIAL_COLUMNS } from "@/lib/parseFinancials";
import { dayKey as localDayKey } from "@/lib/perDiem";
import { money as fmtMoney, moneyCents as fmtMoneyCents } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { Obligation } from "@/types/obligation";
import { getSettlements } from "@/services/settlementsService";
import { getFuelEntries } from "@/services/fuelService";
import { getPlannedHomeDays, getHomeDays } from "@/services/perDiemService";
import { getTrips } from "@/services/tripsService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import type { MaintenanceService } from "@/types/maintenance";
import { getExpensePeriods } from "@/services/expensesService";
import type { SettlementSummary } from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import { deductionBuckets, isFirstOfMonth } from "@/lib/metrics/settlements";
import {
  buildCashBoard, fuelForWeek, runningWeekPace, absorbedBy,
  type PeriodColumn, type CashCheck, type DepositLine,
} from "@/lib/metrics/cashBoard";
import { addDays } from "@/lib/metrics/odometer";
import { payWeekOf, weekLabel, type PayWeek } from "@/lib/metrics/payWeeks";
import type { MissingInput } from "@/lib/integrity/require";
import { MissingInputLine } from "@/components/integrity/MissingInput";
import {
  assembleCashBoardInput, pickPlan, depositOverridesOf, numOrNull, waitsFor, blankInputs,
} from "@/lib/metrics/cashBoardInput";

const LBL = "ds2-label";
const FIELD =
  "w-full bg-well border border-hairline rounded-[8px] px-3 py-2 text-[15px] text-ink tabular-nums focus:outline-none focus:border-amber";

// Money reads the same on every page (format.ts): a negative is "−$1,908",
// never "$-1,908" — this page used to carry its own copies (2026-11-04).
const money = (n: number | null | undefined): string => fmtMoney(n);
const moneyCents = (n: number | null | undefined): string => fmtMoneyCents(n);
// A signed money column, in the SAME format as the Ending column beside it.
// It used to print "+1,234.00" with no currency mark while `moneyCents` two
// cells over printed "$12,340.00" — two money formats in one table row
// (C2b call 10). `moneyCents` already renders a negative as "−$1,234.00", so
// only the plus has to be added.
const signed = (n: number): string =>
  n === 0 ? moneyCents(0) : `${n > 0 ? "+" : ""}${moneyCents(n)}`;

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
  // The home days Jason has PLANNED (migration 107). Non-fatal: a failure here
  // leaves the board forecasting exactly as it did before home time existed,
  // which is wrong in a known direction rather than blank.
  const [plannedHomeDays, setPlannedHomeDays] = useState<string[]>([]);
  // The home days that HAPPENED. A past month's weeks-off is measured from
  // these; a future month's from the plans above. Mixing them would let a plan
  // rewrite history (call 3).
  const [actualHomeDays, setActualHomeDays] = useState<string[]>([]);

  // A typed deposit beats a projection but never the feed's actual; keyed by
  // the STATEMENT date. On the SERVER since v1.268.0 — it used to live in this
  // browser's localStorage, so the laptop and the phone disagreed, clearing
  // site data lost it, Brandie never saw it and no backup ever held it, while
  // every other number on this page went to Postgres.
  //
  // Written through optimistically: the cell you just typed should not wait on
  // a round trip. A failed write puts the old value back and says so, rather
  // than leaving a figure on screen the server never took.
  const [netPayOverrides, setNetPayOverrides] = useState<Record<string, number>>({});
  const [overrideFailed, setOverrideFailed] = useState(false);
  const loadOverrides = () =>
    getDepositOverrides()
      .then((rows) => {
        setNetPayOverrides(depositOverridesOf(rows));
        setOverrideFailed(false);
      })
      .catch(() => setOverrideFailed(true));
  useEffect(() => {
    loadOverrides();
  }, []);
  const writeOverride = (statementDate: string, amount: number | null) => {
    const before = netPayOverrides;
    setNetPayOverrides((o) => {
      const next = { ...o };
      if (amount == null) delete next[statementDate];
      else next[statementDate] = amount;
      return next;
    });
    const call = amount == null ? deleteDepositOverride(statementDate) : setDepositOverride(statementDate, amount);
    call.then(() => setOverrideFailed(false)).catch(() => {
      setNetPayOverrides(before);
      setOverrideFailed(true);
    });
  };
  const [editing, setEditing] = useState<string | null>(null); // which cell is an input
  const [showPaste, setShowPaste] = useState(false);
  const [showAssume, setShowAssume] = useState(false);
  const [showBills, setShowBills] = useState(false);
  const [showOpsNow, setShowOpsNow] = useState(false);

  const [loadError, setLoadError] = useState(false);
  const [adjustFailed, setAdjustFailed] = useState(false);

  // allSettled, not all: one flaky call must not throw away the other twelve
  // and render a stocked page as brand-new onboarding.
  const load = () =>
    Promise.allSettled([
      getObligations(), getCashAssumptions(), getMonthlyFinancials(),
      getForecastAdjustments(), getSettlementSchedule(),
      getPlans(), getAccounts(), getSnapshots(),
      getSettlements(), getFuelEntries(),
      getOpsChecks(), getTrips(), getExpensePeriods(),
      getPlannedHomeDays(), getHomeDays(),
    ])
      .then(([o, a, f, adj, sched, p, acc, snaps, setl, fuel, oc, tr, per, home, were]) => {
        if (were.status === "fulfilled") setActualHomeDays(were.value);
        // Non-fatal, like the rest of this list: a failure leaves the board
        // forecasting every week as a working week, which is what it did
        // before 107 — wrong in a known direction rather than blank.
        if (home.status === "fulfilled") setPlannedHomeDays(home.value);
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

  const plan = useMemo(() => pickPlan(plans), [plans]);
  const floatLine = plan ? Number(plan.float_line) : null;

  // The operator's LOCAL calendar day — a US evening is already tomorrow in
  // UTC, which would start the board a day late and drop tonight's drafts.
  // …and it rolls at midnight: a tab left open Tuesday night must show
  // Wednesday's periods on Wednesday morning without a reload (2026-11-04).
  const [asOfKey, setAsOfKey] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => {
      const k = localDayKey(new Date());
      setAsOfKey((cur) => (cur === k ? cur : k));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  // Settlement day stays Wednesday and the cash lands Thursday — the lag is a
  // schedule setting, so the board dates deposits settlement + lag.
  const setlDay = settlementDay ?? 3;
  const lag = depositLag ?? 1;

  // Settlement-feed measurements: deductions = two ex-advance buckets over the
  // last 12 settlements, applied by each STATEMENT's own calendar position.
  // Fuel = the pace of the last four pay weeks that ran (idle weeks skipped —
  // a calendar-day pace read $583 after eighteen home days, 2026-11-04).
  // Hand-set assumptions remain the FALLBACK when a measurement has no data.
  const buckets = useMemo(() => deductionBuckets(settlements), [settlements]);
  const fuelPace = useMemo(() => runningWeekPace(fuelEntries, asOfKey), [fuelEntries, asOfKey]);

  // Every mile the truck rolls: a reading at every fill, every load's pickup
  // and delivery, and both ends of every trip log (rev 3, issue 8).
  // Shop visits carry the truck's meter too — a fourth source for the chain.
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [servicesFailed, setServicesFailed] = useState(false);
  const loadServices = useCallback(() => {
    setServicesFailed(false);
    getMaintenanceServices().then(setServices).catch(() => setServicesFailed(true));
  }, []);
  // The first fetch runs straight from the effect (no synchronous setState —
  // the React Compiler lint); Retry goes through loadServices, which clears the flag.
  useEffect(() => {
    getMaintenanceServices().then(setServices).catch(() => setServicesFailed(true));
  }, []);
  // The input is assembled by the ONE builder the landing page also calls
  // (lib/metrics/cashBoardInput.ts), then handed to the board.
  const board = useMemo(() => {
    if (!assumptions) return null;
    return buildCashBoard(
      assembleCashBoardInput({
        today: asOfKey, settlementDay, depositLag, plans, accounts, snapshots, opsChecks,
        periods, loads: loads ?? [], settlements, fuelEntries, trips, services, obligations,
        assumptions, overrides: netPayOverrides, plannedHomeDays,
      }),
    );
  }, [
    assumptions, asOfKey, settlementDay, depositLag, plans, accounts, snapshots, opsChecks, periods,
    loads, settlements, fuelEntries, trips, services, obligations, netPayOverrides, plannedHomeDays,
  ]);

  // The deposit the board holds dated exactly `day` (Q3, 2026-11-07): this
  // period's own, last period's landing inside it, and any older period's the
  // number hasn't reached. Null when no deposit is dated that day — the OPS NOW
  // popup then has no deposit field. The amount is null when the deposit's
  // planning input is refused.
  const depositDatedOn = (day: string): { amount: number | null } | null => {
    if (!board) return null;
    for (const col of board.columns) {
      const lines = [col.deposit, col.prevDeposit, ...col.since.map((p) => p.deposit)];
      // A line whose amount is known to be nothing (a home week, a negative carry) is
      // not a deposit to ask about; an unknown amount (refused inputs) still is.
      for (const d of lines) if (d && d.date.slice(0, 10) === day && (d.amount == null || d.amount > 0)) return { amount: d.amount };
    }
    return null;
  };

  // Weeks off, MEASURED from the calendar rather than typed (call 3). A past
  // month counts the days he was home; a future month the days he plans to be;
  // a month with neither keeps whatever he typed, so a plan made before the
  // calendar existed is not silently dropped.
  //
  // This moves the baseline, and in the direction that flatters: read off prod
  // 2026-11-10, July (1 home day), August (8) and October (18, against a typed
  // 2.00) all ran fewer working weeks than the forecast assumed, so the same
  // money comes from 22.13 weeks instead of 23.98 — weekly net $969 → $1,050,
  // the monthly baseline $4,196 → $4,547. It is a correction, but a flattering
  // one, which is the kind worth stating rather than slipping in.
  const measuredWeeksOff = useMemo(() => {
    const months = new Set<string>();
    for (const f of financials) months.add(`${String(f.month).slice(0, 7)}-01`);
    for (const k of adjustments.keys()) months.add(`${String(k).slice(0, 7)}-01`);
    // The forecast runs six months past the last actual, and both calendars
    // can carry marks out there.
    for (const d of [...actualHomeDays, ...plannedHomeDays]) months.add(`${String(d).slice(0, 7)}-01`);
    let m = asOfKey.slice(0, 7);
    for (let i = 0; i < 14; i++) {
      months.add(`${m}-01`);
      const [y, mo] = m.split("-").map(Number);
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    }
    return weeksOffByMonth(actualHomeDays, plannedHomeDays, adjustments, [...months]);
  }, [actualHomeDays, plannedHomeDays, adjustments, financials, asOfKey]);

  const forecast = useMemo(
    () =>
      assumptions
        ? buildForecast(financials, assumptions, measuredWeeksOff, 6, utc(asOfKey))
        : null,
    [financials, assumptions, measuredWeeksOff, asOfKey],
  );
  // Where the archive doesn't chain (a month opening away from the previous ending).
  const archiveBreaks = useMemo(() => archiveGaps(financials), [financials]);
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
    () => ({ fuelEntries, today: asOfKey, fuelPaceWeekly: fuelPace, fuelFallback: null, advanceDefault: numOrNull(assumptions?.weekly_fuel_advance), settlements, settlementDay: setlDay }),
    [fuelEntries, asOfKey, fuelPace, assumptions, settlements, setlDay],
  );
  // The week just gone, whatever it held — a home week reading $0 across 0
  // fills is a true and useful thing to print.
  const lastPayWeek = useMemo(() => {
    const w = payWeekOf(asOfKey);
    const prev = { start: addDays(w.start, -7), end: addDays(w.end, -7) };
    const f = fuelForWeek(fuelCtx, prev);
    return { week: prev, amount: f.soFar, fills: f.fills };
  }, [fuelCtx, asOfKey]);
  const thisPayWeekFuel = useMemo(() => fuelForWeek(fuelCtx, payWeekOf(asOfKey)), [fuelCtx, asOfKey]);
  // The RANGE has to describe the same weeks the headline averages, or the
  // tile contradicts itself (v1.268.0). `runningWeekPace` walks back up to 12
  // weeks collecting only weeks that ran; this walked back exactly 4 calendar
  // weeks and kept the zeros, so on Jason's book it printed "$1,445.84/wk"
  // directly above "four weeks $0.00–$1,752.22" — the $0 being the home week
  // the headline had deliberately excluded.
  const runningWeeks = useMemo(() => {
    const out: { week: PayWeek; amount: number; fills: number }[] = [];
    let w = payWeekOf(asOfKey);
    for (let i = 0; i < 12 && out.length < 4; i++) {
      w = { start: addDays(w.start, -7), end: addDays(w.end, -7) };
      const f = fuelForWeek(fuelCtx, w);
      if (f.soFar > 0) out.push({ week: w, amount: f.soFar, fills: f.fills });
    }
    return out;
  }, [fuelCtx, asOfKey]);
  const fourWeekRange = useMemo(() => {
    const amounts = runningWeeks.map((x) => x.amount);
    return amounts.length ? { lo: Math.min(...amounts), hi: Math.max(...amounts) } : null;
  }, [runningWeeks]);

  // The page's own shape while its thirteen fetches land, instead of a centred
  // sentence that tells you nothing about what is coming (C2b call 10). Same
  // treatment the dispatch board got: the boards are drawn at roughly the
  // heights they will occupy, so the layout does not jump when the data lands.
  //
  // DEVIATION, named: the sheet asked for per-PANEL skeletons, so a slow fetch
  // only holds up its own board. That means rendering 1,700 lines of money page
  // against half-absent data, which is a bigger change than a redraw patch
  // should carry and belongs in its own issue. This fixes the blank-sentence
  // half of the complaint and leaves the all-or-nothing half standing.
  if (loading)
    return (
      <div className="min-h-screen text-ink font-body">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
          <Skeleton className="h-8 w-44 mt-5" />
          <Skeleton className="h-[220px] mt-4" style={{ borderRadius: 13 }} />
          <Skeleton className="h-[92px] mt-4" style={{ borderRadius: 13 }} />
          <Skeleton className="h-[260px] mt-4" style={{ borderRadius: 13 }} />
          <Skeleton className="h-[240px] mt-4" style={{ borderRadius: 13 }} />
        </div>
      </div>
    );

  // ---- the board's verdict badge ----
  const badgeWord =
    board == null
      ? "NO BALANCE YET"
      : board.missing.length > 0
        ? `WAITS FOR ${waitsFor(board.missing).toUpperCase()}`
      : board.clears == null
        ? "NO FLOAT LINE"
        : // Named for its own basis since v1.268.0. This badge judges the
          // LOWEST DAY across both periods; the Ending rows judge where each
          // period lands. Both said "clears the float", so a week that dipped
          // when the bills drafted and recovered by Friday printed a HOLD over
          // two rows that each read "clears".
          board.clears
          ? "EVERY DAY CLEARS"
          : "A DAY UNDER THE FLOAT — HOLD";
  const badgeTone =
    board?.clears == null
      ? "var(--color-faint)"
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

  // ---- the lines, by the day the money moves (2026-11-04, call 1 nodded) ----
  const revFallback = assumptions ? numOrNull(assumptions.weekly_revenue) : null;
  const inOps = " · in your number";
  // Where the advance figure came from, on its own — no amount, so a caller
  // that has already printed the number doesn't print it twice.
  const advanceSrc = (s: DepositLine["advancesSource"]): string =>
    s === "actual"
      ? "the statement"
      : s === "pace"
        ? "your last four draws"
        : s === "none"
          ? "no loads, no advance"
          : s === "home"
            ? "you are home — nothing to draw against"
            : "assumed — fewer than four draws on file";
  // `homeDays` is required, not optional-with-a-default: both line types carry
  // it, so defaulting a missing one would be a silent zero in a money file.
  // The noSilentZero ratchet caught exactly that and was right to.
  const advanceWords = (d: { advances: number | null; advancesSource: DepositLine["advancesSource"]; homeDays: number }): string =>
    d.advancesSource === "actual"
      ? `advances ${money(d.advances)} (the statement)`
      : d.advancesSource === "pace"
        ? `advance ${money(d.advances)} (your last four draws${d.homeDays > 0 ? `, cut for ${d.homeDays} ${d.homeDays === 1 ? "day" : "days"} home` : ""})`
        : d.advancesSource === "none"
          ? "no loads, no advance"
          : d.advancesSource === "home"
            ? "no advance, no fuel — you are home"
            : `advance ${money(d.advances)} (assumed — fewer than four draws on file)`;
  const depositStamp = (d: DepositLine): string | null =>
    d.source === "actual" ? "ACTUAL" : d.source === "override" ? "YOU SAID" : d.source === "fallback" ? "PROJECTED" : "EXPECTED";
  const depositWords = (d: DepositLine, own: boolean): string => {
    const bucketWord = d.bucketKind === "first" ? "first-of-month bucket" : "bucket";
    const expectedBits = [d.inTransit > 0 ? `${d.inTransit} in transit` : null, d.booked > 0 ? `${d.booked} booked` : null].filter(Boolean);
    const delivered = `${d.loads} delivered${d.loads > 0 ? ` ${money(d.loadsNet)}` : ""}`;
    const expected = expectedBits.length ? ` + ${expectedBits.join(" + ")} expected ${money(d.expectedNet)}` : "";
    const head = `${own ? "statement" : `last period’s (${weekLabel(d.week)}) · statement`} ${md(d.statementDate)}`;
    let body: string;
    if (d.source === "actual") body = "actual, from the feed";
    else if (d.source === "override") body = `you said ${money(d.amount)} · the loads say ${d.revenue == null || d.advances == null || d.bucket == null ? "—" : money(d.revenue - d.advances - d.bucket + d.carriedIn)}`;
    else if (d.revenueSource === "home")
      // A week he has told dash he is taking off. Say what it would have
      // brought in beside what it will not — that comparison is the whole
      // reason to mark the week in the first place.
      body = `you are home all week — no loads, and the ${money(revFallback)} planning week does not apply · ${bucketWord} ${money(d.bucket)} still posts`;
    else if (d.revenueSource === "fallback") {
      // The line's OWN revenue, not the page's raw assumption. Part of a week
      // planned home scales the planning week down (107), and quoting the
      // unscaled $4,647 beside a figure computed from $3,983 made the sentence
      // contradict the number it was explaining — caught on dev, not in a test.
      const scaled =
        d.revenue != null && revFallback != null && revFallback > 0 && d.revenue < revFallback - 0.5;
      const week = `the ${money(d.revenue)} planning week`;
      body = `${d.loads + d.inTransit + d.booked > 0 ? `${delivered}${expected} say less than a normal week — ` : "nothing booked yet — "}${week}${scaled ? ` (${money(revFallback)} less the days you are home)` : ""} − ${advanceWords(d)} − ${bucketWord} ${money(d.bucket)}`;
    }
    else body = `${delivered}${expected} − ${advanceWords(d)} − ${bucketWord} ${money(d.bucket)}`;
    const carry: string[] = [];
    // A week he marked home that still carries freight. The loads win the
    // arithmetic — a booking is a fact and a plan is a forecast — but letting
    // them win in SILENCE is how he marked Nov 11–15 home on prod, watched the
    // deposit not move, and reasonably read it as nothing having happened.
    // One of the two has to give, and only he can say which.
    if (d.homeDays > 0 && d.loads + d.inTransit + d.booked > 0)
      carry.push(
        `you marked ${d.homeDays} ${d.homeDays === 1 ? "day" : "days"} home this week, but ${d.loads + d.inTransit + d.booked} ${d.loads + d.inTransit + d.booked === 1 ? "load is" : "loads are"} still on it — the freight is what is counted here`,
      );
    if (d.carriedIn < 0) carry.push(`${moneyCents(d.carriedIn)} carried in from the statement before`);
    if (d.carriedOut < 0) carry.push(`nothing lands — ${moneyCents(d.carriedOut)} carries into the next statement`);
    return [head, body, ...carry, `${d.date < asOfKey ? "landed" : "lands"} ${dayFull(d.date)}`].join(" · ");
  };
  const depositEdit = (d: DepositLine): LedgerLine["edit"] =>
    d.source === "actual" || d.amount == null // a refused deposit has no figure to edit — it needs its input first
      ? null
      : {
          id: `dep-${d.statementDate}`,
          value: d.source === "override" ? (netPayOverrides[d.statementDate] ?? d.amount!) : d.amount!,
          onCommit: (v: number) => writeOverride(d.statementDate, v),
          clear: d.source === "override" ? () => writeOverride(d.statementDate, null) : null,
        };
  const KIND_ORDER: Record<LedgerLine["kind"], number> = { ops: 0, deposit: 1, leftover: 2, payroll: 3, accrual: 4, bill: 5, money: 6, ending: 9 };
  // Bills that draft the same day read as one line.
  const billLines = (list: { label: string; amount: number; date: string; counted: boolean }[], prefix: string, wk: string | null): LedgerLine[] => {
    const byDay = new Map<string, typeof list>();
    for (const bl of list) byDay.set(bl.date, [...(byDay.get(bl.date) ?? []), bl]);
    return [...byDay.entries()].map(([date, xs]) => ({
      key: `${prefix}-bills-${date}`,
      date,
      label: xs.length === 1 ? `Bill · ${xs[0].label}` : `Bills · ${xs.length}`,
      note: `${wk ? `${wk} · ` : ""}${xs.map((x) => `${x.label} ${money(x.amount)}`).join(" · ")}${xs[0].counted ? "" : inOps}`,
      amount: -xs.reduce((t, x) => t + x.amount, 0),
      stamp: null,
      counted: xs[0].counted,
      kind: "bill" as const,
    }));
  };
  const ledgerOf = (c: PeriodColumn): LedgerLine[] => {
    const out: LedgerLine[] = [];
    if (c.key === "current") {
      const bse = board!.base;
      const who = bse.kind === "check" ? "OPS NOW" : utc(bse.date).getUTCDay() === 5 ? "Friday snapshot" : "snapshot";
      const rule = bse.kind === "check" ? "what’s dated on or after it comes off" : "what’s dated after it comes off — the snapshot already holds its own day";
      out.push({ key: "ops", date: bse.date, label: `Ops · ${who}`, note: `typed ${dayFull(bse.date)} · ${rule}${bse.note ? ` · “${bse.note}”` : ""}`, amount: bse.balance, stamp: null, counted: true, kind: "ops" });
      for (const pr of c.since) {
        const wk = weekLabel(pr.week);
        if (pr.deposit) out.push({ key: `s-dep-${pr.week.start}`, date: pr.deposit.date, label: `Deposit · ${wk}`, note: depositWords(pr.deposit, false), amount: pr.deposit.amount, missing: pr.deposit.missing, stamp: depositStamp(pr.deposit), counted: true, kind: "deposit" });
        if (pr.leftover && pr.leftover.amount !== 0) out.push({ key: `s-left-${pr.week.start}`, date: pr.leftover.date, label: `Card leftover → Ops · ${wk}`, note: "what the advance left after the fills", amount: pr.leftover.amount, missing: pr.leftover.missing, stamp: null, counted: true, kind: "leftover" });
        if (pr.payroll) out.push({ key: `s-pay-${pr.week.start}`, date: pr.payroll.date, label: `Payroll · ${wk}`, note: "assumption", amount: negate(pr.payroll.amount), missing: pr.payroll.missing, stamp: null, counted: true, kind: "payroll" });
        if (pr.accrual && pr.accrual.amount !== 0) out.push({ key: `s-acc-${pr.week.start}`, date: pr.accrual.date, label: `Accrual · ${wk}`, note: pr.accrual.words, amount: negate(pr.accrual.amount), missing: pr.accrual.missing, stamp: pr.accrual.source === "projected" ? "PROJECTED" : null, counted: true, flag: pr.accrual.flag, kind: "accrual" });
        out.push(...billLines(pr.bills, `s-${pr.week.start}`, wk));
        for (const m of pr.moneyDays) out.push({ key: `s-md-${m.date}`, date: m.date, label: m.label, note: `${wk} · tax and the surplus that moved`, amount: negate(m.amount), missing: m.missing, stamp: null, counted: true, kind: "money" });
      }
    } else {
      out.push({ key: "ops", date: c.week.start, label: "Opens on the current period’s ending", note: null, amount: c.opening, stamp: null, counted: true, kind: "ops" });
    }
    if (c.prevDeposit) {
      const d = c.prevDeposit;
      out.push({ key: "prevdep", date: d.date, label: "Last period’s deposit", note: depositWords(d, false) + (d.counted ? "" : inOps), amount: d.amount, missing: d.missing, stamp: depositStamp(d), counted: d.counted, edit: depositEdit(d), kind: "deposit" });
    }
    out.push({ key: "dep", date: c.deposit.date, label: "This period’s deposit", note: depositWords(c.deposit, true) + (c.deposit.counted ? "" : inOps), amount: c.deposit.amount, missing: c.deposit.missing, stamp: depositStamp(c.deposit), counted: c.deposit.counted, edit: depositEdit(c.deposit), kind: "deposit" });
    out.push({ key: "pay", date: c.payroll.date, label: "Payroll", note: `assumption${c.payroll.counted ? "" : inOps}`, amount: negate(c.payroll.amount), missing: c.payroll.missing, stamp: null, counted: c.payroll.counted, kind: "payroll" });
    if (c.accrual.amount !== 0)
      out.push({ key: "acc", date: c.accrual.date, label: `Accrual · ${weekLabel(c.week)}`, note: `${c.accrual.words ?? ""}${c.accrual.counted ? "" : inOps}`, amount: negate(c.accrual.amount), missing: c.accrual.missing, stamp: c.accrual.source === "projected" ? "PROJECTED" : null, counted: c.accrual.counted, flag: c.accrual.flag, kind: "accrual" });
    if (c.catchUp && c.catchUp.amount !== 0)
      out.push({ key: "catchup", date: c.catchUp.date, label: c.catchUp.miles != null && c.catchUp.miles < 0 ? "Accrual hold-back · closed weeks re-trued" : "Accrual catch-up · closed weeks re-trued", note: `${c.catchUp.words ?? ""}${c.catchUp.counted ? "" : inOps}`, amount: negate(c.catchUp.amount), missing: c.catchUp.missing, stamp: "RE-TRUED", counted: c.catchUp.counted, kind: "accrual" });
    // The row used to be hidden whenever no advance was drawn. With the clamp
    // gone that would hide a REAL outflow: a week with no loads draws nothing,
    // so fuel bought in it comes out of Ops in full — and the ending subtracts
    // it either way (`ending += fuel.leftover.amount`). A line that moves the
    // ending has to be on the screen (v1.268.0).
    // No coalesce: a NULL amount is a refusal that needs to print its words,
    // so `null !== 0` rendering the row is the behaviour we want. Treating
    // null as zero here would hide the one line that explains itself.
    if (c.fuel.advancesSource !== "none" || c.fuel.leftover.amount !== 0) {
      const f = c.fuel;
      const fuelWords =
        c.state === "open"
          ? `${f.fills === 0 ? "no fill logged yet" : `${fills(f.fills)} so far ${money(f.soFar)}`} · ${f.spentSource === "pace" ? "fuel at the pace of the last four running weeks" : "fuel actual"}`
          : "fuel at the pace of the last four running weeks";
      // The label says "fuel advance" in its own words now (v1.268.0). It read
      // "Card leftover → Ops", which is why Jason could not find the advance on
      // the board at all — the words lived only in this faint note. And it can
      // go NEGATIVE: fuel bought past the advance came out of Ops, and the old
      // `Math.max(0, …)` reported those weeks as $0.
      const over = f.leftover.amount != null && f.leftover.amount < 0;
      const noDraw = f.advancesSource === "none";
      out.push({
        key: "left", date: f.leftover.date,
        label: noDraw ? "Fuel, no advance drawn → from Ops" : over ? "Fuel past the advance → from Ops" : "Fuel advance left → Ops",
        // The amount once, then where it came from. This used to strip the
        // leading word off `advanceWords` and re-wrap the remainder, which
        // printed the figure twice inside nested brackets — "$1,259 advanced
        // ($1,259 (your last four draws))".
        note: `${money(f.advances)} advanced (${advanceSrc(f.advancesSource)}) − ${money(f.spent)} fuel · ${fuelWords}${over ? " · you fuelled past the draw, so the rest came out of Ops" : ""}${f.leftover.counted ? "" : inOps}`,
        amount: f.leftover.amount, missing: f.leftover.missing,
        stamp: f.spentSource === "actual" ? null : "AT PACE",
        counted: f.leftover.counted, kind: "leftover",
      });
    }
    out.push(...billLines(c.bills, c.key, null));
    for (const m of c.moneyDays) out.push({ key: `md-${m.date}`, date: m.date, label: m.label, note: `tax and the surplus that moved${m.counted ? "" : inOps}`, amount: negate(m.amount), missing: m.missing, stamp: null, counted: m.counted, kind: "money" });
    // Lines the PREVIOUS column's ending has already taken off. They stay on
    // the screen — you booked the freight, you should see the payroll — but
    // they read as spent, exactly like a line already inside the Ops number,
    // so nothing is subtracted twice (v1.268.0).
    if (c.key === "next" && board) {
      const prev = board.columns[0];
      for (const l of out) {
        if (l.kind !== "ops" && l.counted && absorbedBy(prev, l.date)) {
          l.counted = false;
          l.note = `${l.note ? `${l.note} · ` : ""}already off in the current period’s ending`;
        }
      }
    }
    out.sort((x, y) => (x.kind === "ops" ? -1 : y.kind === "ops" ? 1 : x.date < y.date ? -1 : x.date > y.date ? 1 : KIND_ORDER[x.kind] - KIND_ORDER[y.kind]));
    const e = c.ending;
    const under = e != null && floatLine != null && e < floatLine;
    // Jason, 2026-11-09: "the forecast ends on Thursday, just before my payroll
    // comes out." He was right. The row borrowed the DEPOSIT's date while its
    // amount already had Friday's payroll subtracted, and its sentence said
    // "after this period's deposit lands" — so the number was Friday's and the
    // label was Thursday's, and reconciling against the bank on Thursday came
    // up a payroll short. It now carries the LAST counted line's date and
    // names it. Not hard-coded to Friday: a bill drafting on the 10th lands
    // after payroll, and then Friday would be wrong the other way.
    // The column tells us the day its ending speaks for, so the ledger and the
    // arithmetic can never disagree about it. `out` is already sorted, so the
    // last row on that day is the last thing to move.
    const endDate = c.endDate;
    const atEnd = out.filter((l) => l.counted && l.kind !== "ops" && l.date === endDate);
    const last = atEnd.length ? atEnd[atEnd.length - 1] : null;
    const afterWords =
      last == null
        ? "after this period’s lines"
        : last.kind === "payroll"
          ? `after ${weekdayLong(last.date)}’s payroll`
          : last.kind === "bill"
            ? `after ${dShort(last.date)}’s bills`
            : last.kind === "accrual"
              ? `after ${weekdayLong(last.date)}’s accrual`
              : last.kind === "money"
                ? "after the money day"
                : last.kind === "leftover"
                  ? "after the card settles"
                  : "after the deposit lands";
    out.push({
      key: "end", date: endDate, label: "Ending",
      note:
        e == null
          ? c.missing.length > 0 || board!.missing.length > 0
            ? (() => {
                const why = c.missing.length > 0 ? c.missing : board!.missing;
                return `waits for ${waitsFor(why)} — ${blankInputs(why.length)}, no ending`;
              })()
            : "waits for the current period’s ending"
          : // The float phrase is said ONE way here and another on the badge, on
            // purpose (v1.268.0). The badge judges the LOWEST DAY across both
            // periods; this judges where THIS period lands. They can disagree —
            // a week that dips when bills draft and recovers by Friday — so
            // they no longer share the words "clears the float".
            // The periods overlap in time: a period's accrual pays the Friday
            // AFTER it closes, inside the next period's week. So this Ending
            // can be dated the same Friday the NEXT period's payroll leaves,
            // and count the accrual but not the payroll. Both figures are
            // right — one is this period's economics, one is the bank — but
            // only one of them is what the account will hold that day, and
            // reading the wrong one off the screen is how you plan short.
            // (Jason, 2026-11-09.)
            // The ending IS the bank now, so it says so plainly rather than
            // footnoting the difference the way v1.267.4 did.
            `what the bank holds ${afterWords}${floatLine != null ? (under ? ` · ${money(floatLine - e)} under the ${money(floatLine)} float` : ` · above the ${money(floatLine)} float`) : ""}${c.key === "current" ? " · opens the next period" : ""}`,
      amount: e, stamp: null, counted: true, kind: "ending", tone: e == null ? undefined : endTone(e),
    });
    return out;
  };
  const ledgers = board ? board.columns.map((c) => ({ column: c, lines: ledgerOf(c) })) : [];

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* statusbar */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">CASH FLOW</h1>
          <span className="font-condensed font-medium text-[16px] text-dim">
            the drains, the drafts, and the runway
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowPaste(true)}
              className="font-condensed font-bold ds2-label text-on-amber bg-amber rounded-[8px] px-3.5 py-2 hover:bg-amber-hi disabled:opacity-40"
            >
              Paste months
            </button>
            <button
              onClick={() => setShowAssume(true)}
              className="ds2-label border border-hairline rounded-[8px] px-3.5 py-2 hover:text-ink"
            >
              Assumptions
            </button>
          </span>
        </div>

        {servicesFailed && (
          <FetchFailed
            what="the shop log's odometer readings"
            detail="the odometer chain runs without them until it loads"
            onRetry={loadServices}
            className="mt-3"
          />
        )}
        {overrideFailed && (
          <FetchFailed
            what="the deposits you typed"
            detail="the board is reading its own projection until they load — anything you type now may not be saved"
            onRetry={loadOverrides}
            className="mt-2"
          />
        )}
        {adjustFailed && (
          <FetchFailed
            what="the forecast's weeks off"
            onRetry={() => {
              setAdjustFailed(false);
              getForecastAdjustments()
                .then((adj) => setAdjustments(new Map(adj.map((r) => [r.month.slice(0, 10), Number(r.weeks_off)]))))
                .catch(() => setAdjustFailed(true));
            }}
            className="mt-3"
          />
        )}
        {loadError && (
          <p className="mt-3 font-condensed text-[13.5px]" style={{ color: "var(--color-warn)" }}>
            ⚠ some data didn’t load — the boards below may be missing pieces.{" "}
            <button className="underline underline-offset-2" onClick={load}>retry</button>
          </p>
        )}

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="text-[14.5px] text-faint">
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
          >
            <span className="ds2-label">
              THE CASH BOARD
            </span>
            <span
              className="font-condensed font-semibold text-[13px] tracking-[.1em] uppercase whitespace-nowrap"
              style={{ color: badgeTone }}
            >
              {badgeWord}
            </span>
            {board && (
              <span className="font-condensed text-[13.5px] text-faint">
                · lowest day{" "}
                <b className="font-semibold text-ink tabular-nums">
                  {board.lowest != null ? money(board.lowest.amount) : "—"}
                </b>
                {board.lowest != null && <> · {dayFull(board.lowest.date)}</>}
                {board.missing.length > 0 && <> · waits for {waitsFor(board.missing)} — {blankInputs(board.missing.length)}, no verdict</>}
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
                className="font-condensed font-bold ds2-label text-on-amber bg-amber rounded-[8px] px-3.5 py-2 hover:bg-amber-hi disabled:opacity-40"
              >
                Ops now ▸
              </button>
              <button
                onClick={() => setShowBills(true)}
                className="ds2-label text-amber-hi hover:text-hot"
              >
                Edit bills ▸
              </button>
            </span>
          </div>

          {board ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-hairline-lo">
                {ledgers.map(({ column: c, lines }) => (
                  <div key={c.key} className="min-w-0">
                    <div className="px-4 py-2 border-b border-hairline ds2-label">
                      <span className="text-ink">{WEEK_TITLE[c.key]}</span>
                      {c.state === "open" && <BoardStamp>OPEN</BoardStamp>}
                      <span className="block text-[12px] normal-case tracking-normal mt-0.5">
                        {weekSpan(c.week)}
                        {c.key === "current" && <> · today is {weekdayLong(asOfKey)}</>} · statement {md(c.deposit.statementDate)} · cash {dayFull(c.deposit.date)}
                      </span>
                    </div>
                    {lines.map((l) => (
                      <LedgerRow key={l.key} line={l} editing={editing} setEditing={setEditing} onFix={() => setShowAssume(true)} />
                    ))}
                  </div>
                ))}
              </div>

              <div className="px-4 pb-3 font-condensed text-[12px] text-faint">
                Each column is one pay period, Wednesday to Tuesday: what it delivers goes on the next Wednesday’s statement and lands Thursday, and that money belongs to the period that earned it · every line sits on the day it hits the bank; a faint line is already inside your number · a statement that nets under zero lands nothing — Landstar carries it into the next one · a TONU is never counted until the statement pays it · the verdict is the lowest day across both periods · <span style={{ color: "var(--color-warn)" }}>red</span> under the float
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

        {/* FUEL — lifted out of THE SETTLEMENTS (C2b call 9).
            It lived in that panel's `settlements.length > 0` branch, so with no
            statement fed it vanished — even with a full fuel log behind it. And
            it never read a statement: `runningWeekPace(fuelEntries)` is the fuel
            log, an entirely separate feed. Escrow and Deductions DO read
            settlements, so those two stay where they are.

            Above the settlements on purpose: it is the number on this page with
            an answer every week, and sitting over the statements rather than
            under them says it does not wait on them. */}
        <div className="ds2-board mt-4 px-4 py-3">
          <p className="ds2-label">
            Fuel
            <span className="ml-2 normal-case tracking-normal text-faint font-normal">
              pace of the last four running weeks · from the fuel log
            </span>
          </p>
          <p className="font-condensed font-semibold tabular-nums text-[26px] text-amber-hi mt-1">
            {fuelPace != null ? `${money(fuelPace)}/wk` : "no running week on the log"}
          </p>
          <p className="font-condensed text-[12.5px] text-faint mt-1 leading-snug">
            {lastPayWeek && (
              <>last week <b className="text-dim tabular-nums">{money(lastPayWeek.amount)}</b> actual ({fills(lastPayWeek.fills)}) · </>
            )}
            this week <b className="text-dim tabular-nums">{money(thisPayWeekFuel.soFar)}</b> so far
            {fourWeekRange && (
              <> · those four weeks <b className="text-dim tabular-nums">{money(fourWeekRange.lo)}–{money(fourWeekRange.hi)}</b></>
            )}
            {" · "}on the pay week’s own {wdLong(setlDay)} statement, cash{" "}
            {wdLong(setlDay + lag)}
          </p>
        </div>

        {/* THE SETTLEMENTS — Landstar's weekly actuals, fed by the server */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule"
          >
            <span className="ds2-label">
              THE SETTLEMENTS
            </span>
            <span className="ml-auto text-[11px] text-faint">
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
                <table className="w-full text-[14px] font-condensed" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[.12em] text-faint">
                      <th className="text-left px-4 py-2">Statement · cash</th>
                      <th className="text-right px-3 py-2">Loads</th>
                      <th className="text-right px-3 py-2">Revenue</th>
                      <th className="text-right px-3 py-2">Refunds</th>
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
                              {md(s.period_ending)}
                            </a>
                            <span className="ml-1 text-faint font-normal"> · cash {md(addDays(s.period_ending.slice(0, 10), lag))}</span>
                            {isFirstOfMonth(s.period_ending) && (
                              <span className="ml-2 text-[11px] text-faint uppercase">1st of mo</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{s.loads}</td>
                          <td className="px-3 py-2 text-right">{moneyCents(Number(s.revenue))}</td>
                          <td className="px-3 py-2 text-right text-dim">{Number(s.refunds) ? `+${moneyCents(Number(s.refunds))}` : "—"}</td>
                          <td className="px-3 py-2 text-right text-dim">−{moneyCents(adv)}</td>
                          <td className="px-3 py-2 text-right text-dim">−{moneyCents(other)}</td>
                          <td className="px-3 py-2 text-right text-ink font-semibold">
                            {Number(s.net) < 0 ? (
                              <span className="text-amber-hi" title="Landstar carries a negative statement into the next one — nothing lands">
                                {moneyCents(Number(s.net))} · carried
                              </span>
                            ) : (
                              moneyCents(Number(s.net))
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {s.unmatched_loads.length > 0 ? (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "var(--color-status-negative-bg)", color: "var(--color-status-negative-text)" }} title={`Loads on the statement but not in dash: ${s.unmatched_loads.join(", ")}`}>
                                FIX {s.unmatched_loads.length}
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "var(--color-status-positive-bg)", color: "var(--color-status-positive-text)" }}>
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
                <div className="mx-4 my-3 px-3 py-2 rounded-[9px] border font-condensed text-[13.5px]" style={{ borderColor: "color-mix(in srgb, var(--color-amber) 35%, transparent)", background: "var(--color-well)" }}>
                  <span className="ds2-label text-amber-hi">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 pb-4 pt-1">
                <div className="ds2-well rounded-[10px] px-3.5 py-3">
                  <p className="ds2-label">Deductions · two buckets · ex-advances</p>
                  <p className="font-condensed font-semibold tabular-nums text-[26px] text-amber-hi mt-1">
                    {buckets.standard != null ? money(buckets.standard) : "—"}
                    <span className="text-[16px] text-faint"> · </span>
                    {buckets.firstOfMonth != null ? money(buckets.firstOfMonth) : "—"}
                  </p>
                  <p className="font-condensed text-[12.5px] text-faint mt-1 leading-snug">
                    standard · first statement of the month (insurance)
                    {nextFirstStatement && <> · next first-of-month: <b className="text-dim">{md(nextFirstStatement)}</b></>}
                  </p>
                </div>
                <div className="ds2-well rounded-[10px] px-3.5 py-3">
                  <p className="ds2-label">Escrow balances</p>
                  <p className="font-condensed font-semibold tabular-nums text-[26px] mt-1" style={{ color: "var(--color-chart-blue)" }}>
                    {settlements[0]?.escrow_tractor == null && settlements[0]?.escrow_trailer == null
                      ? "—"
                      : moneyCents(Number(settlements[0]?.escrow_tractor ?? 0) + Number(settlements[0]?.escrow_trailer ?? 0))}
                  </p>
                  <p className="font-condensed text-[12.5px] text-faint mt-1 leading-snug">
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
          >
            <span className="ds2-label">
              THE SIX-MONTH ROAD
            </span>
            <span className="ml-auto text-[11px] text-faint">
              {financials.length > 0 ? (
                <>
                  last {actualsShown.length} actual months + 6 forecast · a full running month{" "}
                  <b className="text-dim tabular-nums">{forecast ? moneyCents(forecast.baseline) : "—"}</b>
                  {forecast && <> · <b className="text-dim tabular-nums">{moneyCents(forecast.weeklyNet)}</b> net per running week</>}
                  {baselineMonths && forecast && <> · from {baselineMonths} ({forecast.runningWeeks.toFixed(1)} running weeks — planned home weeks taken out once)</>}
                  {archiveBreaks.length > 0 && (
                    <>
                      {" "}·{" "}
                      <span style={{ color: "var(--color-warn)" }}>
                        ⚠ the archive doesn’t chain: {archiveBreaks.map((g) => `${monthLabel(g.month)} opens ${moneyCents(g.beginning)} but ${monthLabel(g.prevMonth)} ended ${moneyCents(g.prevEnding)} (off ${moneyCents(g.diff)})`).join(" · ")} — re-paste one of them
                      </span>
                    </>
                  )}
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
                "fills in after your first PASTE MONTHS import"
              )}
            </span>
          </div>

          {forecast && chartData.length > 0 ? (
            <>
              <div className="px-2 pt-3" style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="var(--color-hairline-lo)" vertical={false} />
                    <XAxis dataKey="m" tick={{ fill: "var(--color-faint)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--color-hairline)" }} />
                    <YAxis
                      tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-hairline)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--color-dim)" }}
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
                    <Line type="monotone" dataKey="actual" stroke="var(--color-amber-hi)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-amber-hi)" }} connectNulls={false} />
                    <Line type="monotone" dataKey="forecast" stroke="var(--color-amber-hi)" strokeWidth={2} strokeDasharray="6 5" strokeOpacity={0.85} dot={{ r: 3, fill: "var(--color-amber-hi)", fillOpacity: 0.85 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[14px] tabular-nums" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[.12em] text-faint">
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
                          {/* An actual month's weeks-off used to print "—" even
                              though the forecast baseline still READS it for
                              that month — a figure that kept working and could
                              not be seen (C2b call 10). It stays read-only
                              here: a month that has posted is history, and the
                              input belongs on the months still being planned. */}
                          <td className="text-right px-3.5 py-1.5 border-b border-hairline-lo text-faint">
                            {(() => {
                              const w = measuredWeeksOff.get(f.month.slice(0, 10));
                              return w != null && w > 0 ? `${w}` : "—";
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                    {forecast.months.map((fm) => (
                      <tr key={fm.month} className="text-dim">
                        <td className="text-left px-3.5 py-1.5 border-b border-hairline-lo">
                          {monthLabel(fm.month)} <span className="text-faint">◦</span>
                          {fm.weeksOff > 0 && (
                            <span className="ml-2 font-condensed text-[11px] font-semibold tracking-[.06em] px-[7px] rounded-full border" style={{ color: "var(--color-chart-blue)", borderColor: "color-mix(in srgb, var(--color-chart-blue) 45%, transparent)" }}>
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
                          {weeksOffIsDerived(fm.month, actualHomeDays, plannedHomeDays) ? (
                            // Measured from the Per Diem calendar, so there is
                            // nothing to type (call 3). The point of deriving
                            // it was to stop him saying the same thing twice —
                            // leaving the box editable beside a measured figure
                            // would be exactly the disagreement the sheet
                            // refused to keep.
                            <span
                              className="text-[13px] text-dim tabular-nums"
                              title="Measured from the days marked on Per Diem"
                            >
                              {fm.weeksOff}
                              <span className="ml-1 text-faint text-[11px]">measured</span>
                            </span>
                          ) : (
                          <input
                            // Key on the saved value: a failed save's reload
                            // snaps the input back instead of showing a number
                            // the row's math never took.
                            key={`${fm.month}:${fm.weeksOff}`}
                            type="number"
                            min={0}
                            max={5}
                            step={0.5}
                            className="w-14 bg-well border border-hairline rounded-[6px] px-1.5 py-0.5 text-right text-[13px] text-ink focus:outline-none focus:border-amber"
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
                                      .catch(() => setAdjustFailed(true)),
                                  );
                              }
                            }}
                          />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {lastForecastEnd != null && (
                <div className="mx-4 my-3 rounded-[8px] px-3.5 py-2.5 font-condensed text-[13.5px] text-dim" style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)", boxShadow: "var(--shadow-inset)" }}>
                  <b className="text-ink tabular-nums">true spendable ≈ {money(lastForecastEnd - catchup)}</b>
                  {" — "}{monthLabel(forecast.months.at(-1)!.month)} ending {money(lastForecastEnd)} −{" "}
                  <b className="text-ink">{money(catchup)}</b> tax catch-up earmark · forecast = 6-actual average
                  net income − home-time weeks, depreciation added back, financing floor and taxes out
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-text px-4 py-6">
              Fills in after your first import — PASTE MONTHS up top takes rows straight from your QBO
              worksheet and previews every month before anything commits.
            </p>
          )}
        </div>

        {/* Phase 1 of "Does the forecast hold?" — below the six-month road, on
            the forecasting page, which is where he will be when he doubts a
            number. It offers; it never applies. */}
        <AssumptionCheck
          settlements={settlements}
          assumptions={assumptions}
          onAdopt={async (key, value) => {
            await patchCashAssumptions({ [key]: value } as Parameters<typeof patchCashAssumptions>[0]);
            const fresh = await getCashAssumptions();
            setAssumptions(fresh);
          }}
        />

        {showOpsNow && (
          <OpsNowPopup
            today={asOfKey}
            base={board?.base ?? null}
            depositOn={depositDatedOn}
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

// ---- the cash board's lines ----
const negate = (n: number | null): number | null => (n == null ? null : -n);
const WEEK_TITLE: Record<PeriodColumn["key"], string> = {
  current: "Current period",
  next: "Next period",
};

// One line of the board: the day the money moves, what it is, the figure.
export interface LedgerLine {
  key: string;
  date: string; // YYYY-MM-DD — the day it hits the bank
  label: string;
  note: string | null;
  amount: number | null; // signed: money in positive, money out negative; null → "—"
  stamp: string | null; // ACTUAL · EXPECTED · PROJECTED · YOU SAID · AT PACE
  counted: boolean; // false → already inside the Ops number, shown faint
  flag?: string | null;
  tone?: string;
  missing?: MissingInput[]; // a refused line: the input it needs isn't set
  edit?: { id: string; value: number; onCommit: (v: number) => void; clear: (() => void) | null } | null;
  kind: "ops" | "deposit" | "payroll" | "accrual" | "leftover" | "bill" | "money" | "ending";
}

// The little tags: OPEN · ACTUAL · EXPECTED · PROJECTED · YOU SAID · AT PACE.
const BoardStamp = ({ children }: { children: string }) => (
  <span className="ml-1.5 font-condensed font-semibold text-[12px] tracking-[.1em] uppercase text-amber-hi inline-block align-middle">
    {children}
  </span>
);

// "Wed, Nov 4"
const dShort = (k: string): string =>
  new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const LedgerRow = ({
  line, editing, setEditing, onFix,
}: {
  line: LedgerLine;
  editing: string | null;
  setEditing: (v: string | null) => void;
  onFix: () => void;
}) => {
  const plain = line.kind === "ops" || line.kind === "ending";
  const figure =
    line.amount == null ? "—" : plain ? money(line.amount) : line.amount > 0 ? `+${money(line.amount)}` : money(line.amount);
  const tone = line.tone ?? (!line.counted ? "var(--color-faint)" : line.amount != null && line.amount > 0 && !plain ? "var(--color-ok)" : undefined);
  return (
    <div
      className={`grid grid-cols-[84px_1fr_auto] gap-x-3 px-4 py-2 border-b border-hairline-lo ${line.kind === "ending" ? "bg-rail" : ""}`}
      style={line.counted ? undefined : { opacity: 0.6 }}
    >
      <div className="text-[11px] uppercase tracking-[.12em] text-faint pt-[3px] whitespace-nowrap">{dShort(line.date)}</div>
      <div className="min-w-0">
        <div className={`font-condensed ${line.kind === "ending" ? "font-semibold text-ink" : "text-dim"} text-[14px]`}>{line.label}</div>
        {line.missing && line.missing.length > 0 ? (
          <div className="mt-0.5">
            <MissingInputLine what="place this line" missing={line.missing} onFix={onFix} />
          </div>
        ) : (
          line.note && <div className="font-condensed text-[12px] text-faint leading-[1.35] mt-0.5">{line.note}</div>
        )}
        {line.flag && <div className="font-condensed text-[12px] text-amber-hi leading-[1.35] mt-0.5">{line.flag}</div>}
      </div>
      <div className="text-right whitespace-nowrap tabular-nums">
        {line.edit ? (
          <>
            {line.amount != null && line.amount > 0 && !plain && <span style={{ color: tone }}>+</span>}
            <EditCell id={line.edit.id} editing={editing} setEditing={setEditing} value={line.edit.value} prefix="$" onCommit={line.edit.onCommit} />
            {line.edit.clear && (
              <button className="ml-1 text-amber-hi hover:text-hot text-[12px]" onClick={line.edit.clear} title="drop what you said">
                ✕
              </button>
            )}
          </>
        ) : (
          <span className={line.kind === "ending" ? "font-condensed font-semibold tabular-nums text-[24px]" : "font-semibold"} style={tone ? { color: tone } : undefined}>
            {figure}
          </span>
        )}
        {line.stamp && <BoardStamp>{line.stamp}</BoardStamp>}
      </div>
    </div>
  );
};

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
        className="w-28 bg-well border border-amber rounded-[6px] px-2 py-0.5 text-right text-[14px] text-ink focus:outline-none"
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

  const SEL = "bg-well border border-hairline rounded-[6px] px-1.5 py-1 text-[13px] text-ink focus:outline-none focus:border-amber";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule">
          <span className="ds2-label">THE BILLS</span>
          <span className="text-[11px] text-faint">what drafts, and when</span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <table className="w-full text-[14px] tabular-nums" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-[11px] uppercase tracking-[.12em] text-faint">
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
                        <span className="ml-1.5 font-condensed text-[11px] text-faint uppercase tracking-[.06em]" title="break-even reads the principal amount, not this draft">
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
                      <button disabled={busy} className="ds2-label text-amber-hi hover:text-hot mr-2" onClick={() => saveRow(o)}>save</button>
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
                  <button disabled={busy} className="ds2-label text-amber-hi hover:text-hot" onClick={addBill}>+ add</button>
                </td>
              </tr>
            </tbody>
          </table>
          {err && <p className="font-condensed text-[13px] mt-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <p className="font-condensed text-[12px] text-faint mt-3 leading-[1.5]">
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
    // The current calendar month isn't closed — a partial month would enter
    // the forecast's baseline and anchor the chain on it (2026-11-04).
    const curMonth = `${localDayKey(new Date()).slice(0, 7)}-01`;
    const open = good.filter((g) => String(g.row!.month).slice(0, 10) >= curMonth);
    if (open.length > 0) {
      setErr(`${open.map((g) => monthLabel(String(g.row!.month))).join(", ")} ${open.length === 1 ? "isn’t" : "aren’t"} closed yet — paste a month after its books close.`);
      return;
    }
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
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule">
          <span className="ds2-label">PASTE MONTHS</span>
          <span className="text-[11px] text-faint">one row per month, straight from the QBO worksheet</span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <div className="font-mono text-[11.5px] rounded-[6px] px-2.5 py-2 overflow-x-auto whitespace-nowrap" style={{ color: "var(--color-amber-hi)", background: "var(--color-well)", border: "1px dashed color-mix(in srgb, var(--color-amber) 35%, transparent)" }}>
            {FINANCIAL_COLUMNS.join(" · ")}
          </div>
          <textarea
            className="w-full mt-3 bg-well border border-hairline rounded-[8px] px-3 py-2 text-[13px] font-mono text-ink min-h-[110px] focus:outline-none focus:border-amber"
            placeholder={"2026-07\t33552.45\t6521.97\t…  (tab or comma separated; header row ok; re-pasting a month updates it)"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {parsed.length > 0 && (
            <table className="w-full mt-3 text-[13px] tabular-nums" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="text-[11px] uppercase tracking-[.12em] text-faint">
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
          {err && <p className="text-[13px] mt-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <div className="flex items-center gap-2 mt-4">
            <button
              disabled={busy || good.length === 0 || bad.length > 0}
              onClick={commit}
              className="font-condensed font-bold ds2-label text-on-amber bg-amber rounded-[8px] px-3.5 py-2 hover:bg-amber-hi disabled:opacity-40"
            >
              {busy ? "Committing…" : `Commit ${good.length} month${good.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={onClose} className="ds2-label border border-hairline rounded-[8px] px-3.5 py-2 hover:text-ink">
              Cancel
            </button>
            {bad.length > 0 && (
              <span className="font-condensed text-[12.5px]" style={{ color: "var(--color-warn)" }}>
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
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule">
          <span className="ds2-label">ASSUMPTIONS</span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="mb-3">
              <label className={LBL}>{label}</label>
              <input type="number" step="0.01" className={FIELD} value={f[key]} onChange={set(key)} />
            </div>
          ))}
          {err && <p className="text-[13px] mb-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <p className="font-condensed text-[12.5px] text-faint leading-[1.5]">
            The red line on both boards is the plan’s float{floatLine != null && <> ({money(floatLine)})</>} — edited on{" "}
            <Link to="/status" className="text-amber-hi hover:text-hot">Status</Link>, not here. Bills live with your
            obligations on <Link to="/expenses" className="text-amber-hi hover:text-hot">Expenses</Link>: category, draft
            day, and full draft amount; loan rows keep a separate break-even (principal) amount so nothing double-counts.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <button disabled={busy} onClick={save} className="font-condensed font-bold ds2-label text-on-amber bg-amber rounded-[8px] px-3.5 py-2 hover:bg-amber-hi disabled:opacity-40">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="ds2-label border border-hairline rounded-[8px] px-3.5 py-2 hover:text-ink">
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
  today, base, depositOn, onClose, onSaved,
}: {
  today: string;
  base: CashCheck | null; // the number the board opens on today
  depositOn: (day: string) => { amount: number | null } | null; // the deposit dated that day, if any
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [asOf, setAsOf] = useState(today);
  const [balance, setBalance] = useState("");
  const [note, setNote] = useState("");
  // "it has landed" — unticked by default: he types before the bank posts.
  const [landed, setLanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const typed = Number(balance);
  const dayKey = isDayKey(asOf.slice(0, 10)) ? asOf.slice(0, 10) : null;
  // Only on a day a deposit is dated is there a field to ask about.
  const dep = dayKey ? depositOn(dayKey) : null;
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
      await createOpsCheck({ as_of: dayKey, balance: typed, note: note.trim() || null, deposit_landed: dep ? landed : null });
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
        <div className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule">
          <span className="ds2-label">OPS NOW</span>
          <span className="text-[11px] text-faint">
            the bank’s ops balance this morning
          </span>
          <button className="ml-auto text-faint hover:text-ink" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <div className="mb-3">
            <label className={LBL} htmlFor="opsnow-asof">As of</label>
            <input id="opsnow-asof" type="date" className={FIELD} value={asOf} max={today} onChange={(e) => { setAsOf(e.target.value); setLanded(false); setErr(null); }} />
          </div>
          <div className="mb-3">
            <label className={LBL} htmlFor="opsnow-balance">Ops balance</label>
            <input id="opsnow-balance" inputMode="decimal" placeholder="0.00" className={FIELD} value={balance} onChange={(e) => { setBalance(e.target.value); setErr(null); }} />
          </div>
          {dep && (
            <div className="mb-3">
              <span className={LBL}>{dayKey === today ? "Today’s deposit" : `The deposit dated ${md(dayKey!)}`}</span>
              <label className="flex items-center gap-2 font-condensed text-[14.5px] text-ink cursor-pointer">
                <input id="opsnow-landed" type="checkbox" checked={landed} onChange={(e) => setLanded(e.target.checked)} />
                it has landed
              </label>
              <p className="font-condensed text-[13px] text-faint mt-1">
                {dep.amount != null ? `Landstar’s ${money(dep.amount)}` : "a deposit"} is dated {dayKey === today ? "today" : md(dayKey!)} · unticked, the board keeps it still to come
              </p>
            </div>
          )}
          <div className="mb-3">
            <label className={LBL} htmlFor="opsnow-note">Note · optional</label>
            <input id="opsnow-note" className={FIELD} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="before Friday’s payroll and the sweep" />
          </div>
          <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-2">
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
          <button className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[14.5px] text-dim bg-well border border-hairline" onClick={onClose}>CANCEL</button>
          <button
            className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[14.5px] bg-amber text-on-amber disabled:opacity-50"
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
