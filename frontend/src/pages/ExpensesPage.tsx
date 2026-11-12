import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { localToday } from "@/lib/metrics/today";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import {
  getExpensePeriods,
  getExpensePeriod,
  getCategoryHistory,
} from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getExpenseMetrics, getTrueMonthly } from "@/lib/metrics/expenses";
import { monthlyObligationCost, basisCaption } from "@/lib/metrics/rateTargets";
import { whyThisMonth, categoryOutliers, type CategoryMonth } from "@/lib/metrics/monthDiagnosis";
import { WhyThisMonth } from "@/components/expenses/WhyThisMonth";
import { CostPerMileTrend } from "@/components/expenses/CostPerMileTrend";
import { computeRateTargets } from "@/hooks/useRateTargets";
import { monthMiles } from "@/lib/metrics/rateTargets";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { useSplitToday } from "@/hooks/useSplitToday";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { ExpenseUpload } from "@/components/expenses/ExpenseUpload";
import { ExpenseLedger } from "@/components/expenses/ExpenseLedger";
import { ExpenseYtdChart } from "@/components/expenses/ExpenseYtdChart";
import { ObligationsCard } from "@/components/expenses/ObligationsCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { burnFromPeriods } from "@/lib/metrics/sitCost";
import { BandedLadder } from "@/components/ui/BandedLadder";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { money } from "@/lib/format";
import { FetchFailed } from "@/components/integrity/FetchFailed";

// That month's miles from loads (drives cost-per-mile + break-even) — the
// basis's own monthMiles (a union of odometer spans), so the month tile and
// the rate to book can never count a mile differently (2026-11-04, DB-04).
const monthMilesOf = (loads: Load[], periodMonth: string, trips: Trip[] = []) => {
  const d = new Date(periodMonth);
  const m = monthMiles(loads, d.getUTCFullYear(), d.getUTCMonth(), trips);
  return { totalMiles: m.total, loadedMiles: m.loaded };
};

const NO_PERIODS: ExpensePeriod[] = [];

const ExpensesPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { loads } = useLoads(0);
  const { trips } = useTrips(0); // home and shop miles join the basis (BASIS-07)
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The selected period's full record is fetched into `fetched`; `selected` is
  // derived (null the moment nothing is selected) rather than set inside the
  // effect — eslint react-hooks/set-state-in-effect.
  const [fetched, setFetched] = useState<ExpensePeriod | null>(null);
  const selected = selectedId ? fetched : null;
  const [showUpload, setShowUpload] = useState(false);
  // Loading until the list fetch for the current refreshKey has landed — derived, not set in the effect.
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const loading = loadedKey !== refreshKey;
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const split = useSplitToday(); // the pay split in force today (NET-01)

  // Obligations live at the page level so the headline KPIs + chart can fold
  // them into true cost; the card just edits the list and calls this back.
  // A failed fetch is a named, retryable line — never a page that renders as if
  // there were no data (NET-03). Cleared when the retry lands.
  const [obligationsFailed, setObligationsFailed] = useState(false);
  const [scheduleFailed, setScheduleFailed] = useState(false);
  const [periodsFailed, setPeriodsFailed] = useState(false);
  const [periodFailed, setPeriodFailed] = useState(false);
  const [windowFailed, setWindowFailed] = useState(false);

  const reloadObligations = () =>
    getObligations()
      .then((o) => {
        setObligations(o);
        setObligationsFailed(false);
      })
      .catch(() => setObligationsFailed(true));
  const reloadSchedule = () =>
    getSettlementSchedule()
      .then((sc) => {
        setSchedule(sc);
        setScheduleFailed(false);
      })
      .catch(() => setScheduleFailed(true));

  useEffect(() => {
    reloadSchedule();
  }, []);
  useEffect(() => {
    reloadObligations();
  }, []);

  // Load the period list; keep the current selection if it still exists.
  useEffect(() => {
    let active = true;
    getExpensePeriods()
      .then((ps) => {
        if (!active) return;
        setPeriods(ps);
        setPeriodsFailed(false);
        setSelectedId((cur) =>
          cur && ps.some((p) => p.period_id === cur)
            ? cur
            : (ps[0]?.period_id ?? null),
        );
      })
      .catch(() => {
        if (active) setPeriodsFailed(true);
      })
      .finally(() => {
        if (active) setLoadedKey(refreshKey);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Load the selected period's lines.
  useEffect(() => {
    let active = true;
    if (!selectedId) return;
    getExpensePeriod(selectedId)
      .then((p) => {
        if (active) {
          setFetched(p);
          setPeriodFailed(false);
        }
      })
      .catch(() => {
        if (active) setPeriodFailed(true);
      });
    return () => {
      active = false;
    };
  }, [selectedId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const miles = useMemo(
    () =>
      selected
        ? monthMilesOf(loads, selected.period_month, trips)
        : { totalMiles: 0, loadedMiles: 0 },
    [selected, loads, trips],
  );
  const metrics = selected
    ? getExpenseMetrics(selected, miles.totalMiles, miles.loadedMiles)
    : null;

  // ---- WHY THIS MONTH (C3b) ----
  //
  // Revenue and cost, measured against the OTHER filed months — the two levers
  // that sum to the month's shortfall. October lost money on freight and August
  // on spending, and until now the page drew both as the same red number.
  const [catHistory, setCatHistory] = useState<CategoryMonth[]>([]);
  useEffect(() => {
    getCategoryHistory()
      .then(setCatHistory)
      .catch(() => setCatHistory([]));
  }, [refreshKey]);

  const why = useMemo(
    () => (selected ? whyThisMonth(periods, selected.period_month) : null),
    [periods, selected],
  );
  const outliers = useMemo(
    () =>
      selected ? categoryOutliers(catHistory, selected.period_month) : [],
    [catHistory, selected],
  );
  // The revenue lever, described: miles and income per mile against the same
  // months the comparison stands on. Measured here rather than taken from the
  // basis window, which covers only six months and may not hold this one.
  const whyMiles = useMemo(() => {
    if (!selected) return { mine: null, usual: null, perMile: null, usualPerMile: null };
    const key = String(selected.period_month).slice(0, 10);
    // flatMap rather than filter-then-map: a month without an income figure is
    // DROPPED, never read as $0. A zero here would be a month that earned
    // nothing, which is a different claim from one that never filed.
    const withMiles = periods.flatMap((p) => {
      const inc = p.income_total;
      if (inc == null || String(p.period_month).slice(0, 10) === key) return [];
      const mi = monthMilesOf(loads, p.period_month, trips).totalMiles;
      return mi > 0 ? [{ mi, inc }] : [];
    });
    const usual =
      withMiles.length === 0
        ? null
        : withMiles.reduce((s, x) => s + x.mi, 0) / withMiles.length;
    const usualPerMile =
      withMiles.length === 0
        ? null
        : withMiles.reduce((s, x) => s + x.inc, 0) / withMiles.reduce((s, x) => s + x.mi, 0);
    return {
      mine: miles.totalMiles > 0 ? miles.totalMiles : null,
      usual,
      perMile:
        miles.totalMiles > 0 && selected.income_total != null
          ? selected.income_total / miles.totalMiles
          : null,
      usualPerMile,
    };
  }, [selected, periods, loads, trips, miles.totalMiles]);


  // Obligations folded into every headline number. Dollar figures use this
  // month (reconcile with the month's P&L); per-mile figures use the trailing
  // blend. obligationsTotal = 0 → these equal the operating-only numbers.
  const obligationsTotal = useMemo(
    () => obligations.filter((o) => o.active && !o.on_pl).reduce((s, o) => s + Number(o.amount), 0),
    [obligations],
  );
  // Break-even / rate-ladder basis excludes owner draws (a draw is a profit
  // distribution, not an operating cost); the cash-out "true cost" above keeps
  // them. Equal until a draw is active.
  const obligationsCost = useMemo(
    () => monthlyObligationCost(obligations),
    [obligations],
  );
  // THE basis — the same function the Market page, the Dashboard and Score a
  // Load stand on: the last six complete months with a P&L, cost over driven
  // miles, divided by the blended keep. Every blended figure on this page
  // (the per-mile tiles, the burn, the rate to book) reads it, so the books
  // and the market can never quote two break-evens (2026-11-01: this page
  // blended three months and divided by the 73% linehaul take while the
  // Market page blended six and divided by the measured keep).
  const targets = useMemo(
    () => computeRateTargets(loads, periods, obligationsCost, schedule, localToday(), trips, split),
    [loads, periods, obligationsCost, schedule, trips, split],
  );
  const basisWord = targets.basis.windowLabel ?? "no P&L filed";
  // Figures DERIVED from the commitment are named after the promise, not
  // after a window of months they no longer blend (migration 109). Anything
  // still measured over the window keeps naming its months.
  const floorWord = basisCaption(targets.basis);
  // Full periods (with lines) for the basis months, so the sit/run burn blends
  // the fixed/variable split over the same window the per-mile figures blend.
  const windowIds = useMemo(() => {
    const keys = new Set(
      targets.basis.monthsDetail.map((m) => `${m.year}-${String(m.month + 1).padStart(2, "0")}`),
    );
    return periods.filter((p) => keys.has(String(p.period_month).slice(0, 7))).map((p) => p.period_id);
  }, [periods, targets.basis.monthsDetail]);
  const [windowFetched, setWindowFetched] = useState<ExpensePeriod[]>([]);
  // Derived, not set in the effect: no window → no months, whatever landed last.
  const windowFull = windowIds.length === 0 ? NO_PERIODS : windowFetched;
  useEffect(() => {
    let active = true;
    if (windowIds.length === 0) return;
    Promise.all(windowIds.map((pid) => getExpensePeriod(pid)))
      .then((ps) => {
        if (active) {
          setWindowFetched(ps);
          setWindowFailed(false);
        }
      })
      .catch(() => {
        if (active) setWindowFailed(true);
      });
    return () => {
      active = false;
    };
  }, [windowIds, refreshKey]);

  // ONE sit/run burn (lib/metrics/sitCost): the landing's leave reserve reads
  // the same function, so a parked week costs the same on both pages.
  const burn = useMemo(() => burnFromPeriods(windowFull, obligationsTotal), [windowFull, obligationsTotal]);

  const trueMonthly =
    metrics && selected
      ? getTrueMonthly(metrics.monthlyCost, obligationsTotal, selected.income_total)
      : null;

  // A month saved without a total has no figure for it — "—", never $0 (NET-03).
  const profitOf = (p: ExpensePeriod | null | undefined): number | null =>
    p == null || p.income_total == null || p.cogs_total == null || p.expense_total == null
      ? null
      : p.income_total - (p.cogs_total + p.expense_total);
  const selIncome = selected == null ? null : selected.income_total;
  const selCost =
    selected == null || selected.cogs_total == null || selected.expense_total == null
      ? null
      : selected.cogs_total + selected.expense_total;
  const selProfit = profitOf(selected);
  const selMargin = selProfit != null && selIncome != null && selIncome > 0 ? selProfit / selIncome : null;
  const dollars = (n: number | null) => (n == null ? "—" : money(n));
  // Months with no totals are left out of the comparison, not counted as $0.
  const isBestMonth =
    selected != null &&
    selProfit != null &&
    periods.every((p) => {
      const prof = profitOf(p);
      return p.period_id === selected.period_id || prof == null || prof <= selProfit;
    });
  // Inputs that failed to load: the figures built on them print "—".
  const costUnsure = obligationsFailed;
  const basisUnsure = obligationsFailed || scheduleFailed;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">EXPENSES</h1>
          <span className="font-condensed font-medium text-[16px] text-dim">
            the books — what it costs to run
          </span>
          <span className="flex-1" />
          {periods.length > 1 && (
            <span
              className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px] overflow-x-auto"
              style={{ boxShadow: "var(--shadow-inset)" }}
              role="tablist"
            >
              {[...periods]
                .reverse()
                .slice(-8)
                .map((per) => (
                  <button
                    key={per.period_id}
                    role="tab"
                    aria-selected={selectedId === per.period_id}
                    onClick={() => setSelectedId(per.period_id)}
                    className={`px-2.5 rounded-md font-condensed font-semibold text-[13px] whitespace-nowrap ${
                      selectedId === per.period_id
                        ? "bg-amber text-canvas"
                        : "text-dim hover:text-ink"
                    }`}
                  >
                    {per.period_label}
                  </button>
                ))}
            </span>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[15px] tracking-[.05em] bg-amber text-on-amber"
          >
            UPLOAD P&L
          </button>
        </div>

        {(obligationsFailed || scheduleFailed) && (
          <div className="mt-4 flex flex-col gap-1">
            {obligationsFailed && <FetchFailed what="the obligations" onRetry={reloadObligations} />}
            {scheduleFailed && <FetchFailed what="the settlement schedule" onRetry={reloadSchedule} />}
          </div>
        )}

        {loading ? (
          <div className="mt-4">
            <StatCardsSkeleton count={3} />
            <BlockSkeleton className="h-64 mt-6" />
          </div>
        ) : periodsFailed ? (
          <FetchFailed className="mt-4" what="the P&L" onRetry={refresh} />
        ) : periods.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No P&L uploaded yet"
              hint="Upload a profit & loss statement to see your true cost per mile."
            />
          </div>
        ) : selected && metrics && trueMonthly ? (
          <>
            {/* the month sentence */}
            <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
              <span className="font-display text-[22.5px] tracking-[.03em] uppercase">
                {selected.period_label}
              </span>
              <span className="text-[14.5px] text-faint">
                {selected && selected.income_total == null && selected.cogs_total == null && selected.expense_total == null && (
                  <span className="font-semibold" style={{ color: "var(--color-warn)" }}>
                    this month was saved without its totals — re-upload its P&L ·{" "}
                  </span>
                )}
                · <b className="font-semibold text-ink tabular-nums">{dollars(selIncome)}</b> in ·{" "}
                <b className="font-semibold text-ink tabular-nums">{dollars(selCost)}</b> out ·{" "}
                <b className="font-semibold text-ink tabular-nums">{dollars(selProfit)}</b> kept
                {selMargin != null && (
                  <>
                    {" "}
                    ·{" "}
                    <b className="font-bold" style={{ color: selMargin >= 0 ? "var(--color-status-positive-text)" : "var(--color-status-negative-text)" }}>
                      {(selMargin * 100).toFixed(1)}% margin
                    </b>
                  </>
                )}
                {isBestMonth && periods.length > 1 && " — your best month on the books"}
              </span>
            </div>

            {/* the month board */}
            <div className="ds2-board overflow-hidden mt-4">
              <div className="grid grid-cols-2 md:grid-cols-5">
                {[
                  { v: costUnsure ? "—" : money(trueMonthly.trueMonthlyCost), l: "True monthly cost" },
                  { v: costUnsure ? "—" : money(trueMonthly.trueWeeklyCost), l: "Weekly cost" },
                  {
                    v: basisUnsure || targets.basis.costPerTotalMile == null ? "—" : `$${targets.basis.costPerTotalMile.toFixed(2)}`,
                    l: `Cost / total mi · ${floorWord}`,
                  },
                  {
                    v:
                      basisUnsure || targets.basis.breakEvenRpm == null
                        ? "—"
                        : `$${targets.basis.breakEvenRpm.toFixed(2)}`,
                    l: `Break-even / loaded mi · ${basisWord}`,
                  },
                  {
                    v:
                      costUnsure || trueMonthly.trueNetMargin == null
                        ? "—"
                        : `${(trueMonthly.trueNetMargin * 100).toFixed(1)}%`,
                    l: "Net margin · app est.",
                    pos: costUnsure || trueMonthly.trueNetMargin == null ? undefined : trueMonthly.trueNetMargin >= 0,
                  },
                ].map((k, ki) => (
                  <div
                    key={k.l}
                    className={`px-4 py-3 ${ki < 4 ? "md:border-r" : ""} ${ki < 2 ? "border-b md:border-b-0" : ""} ds2-cell-rule`}
                  >
                    <p
                      className="font-condensed font-semibold text-[24px] tabular-nums"
                      style={"pos" in k && k.pos != null ? { color: k.pos ? "var(--color-status-positive-text)" : "var(--color-status-negative-text)" } : undefined}
                    >
                      {k.v}
                    </p>
                    <p className="font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint mt-[2px]">
                      {k.l}
                    </p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
                <b className="text-dim">Cost / total mile</b> is over every mile you drive;{" "}
                <b className="text-dim">break-even / loaded mile</b> spreads that same cost over
                only the paid miles — the gap is your deadhead. Per-mile figures blend{" "}
                <b className="text-dim">{basisWord}</b> — {targets.basis.months} of{" "}
                {targets.basis.monthsWanted} months filed, the same basis as the Market page and the
                Dashboard.
                {obligationsCost > 0 && ` Cost includes ${money(obligationsCost)}/mo of notes.`}
              </div>
              {targets.basis.missingLabel && (
                <div className="px-4 py-[6px] border-t ds2-cell-rule font-condensed text-[13.5px] text-amber-hi">
                  ⚠ no P&L filed for {targets.basis.missingLabel} — the blend stops short of it. Upload
                  the month above and every blended number here and on the Market page moves.
                </div>
              )}
            </div>

            {/* The result is above; this is why it came out that way. It sits
                here rather than further down because a red margin with no
                diagnosis is the thing C3b exists to fix. */}
            {why && (
              <WhyThisMonth
                why={why}
                label={selected.period_label ?? "this month"}
                outliers={outliers}
                miles={whyMiles.mine}
                usualMiles={whyMiles.usual}
                perMile={whyMiles.perMile}
                usualPerMile={whyMiles.usualPerMile}
              />
            )}

            {windowFailed && !costUnsure && (
              <FetchFailed className="mt-4" what="the P&L months behind the burn" onRetry={refresh} />
            )}

            {/* the burn — sit vs run */}
            {burn && !costUnsure && (
              <div className="ds2-board overflow-hidden mt-4">
                <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                  <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                    The burn — sit vs run
                  </span>
                  <span className="font-condensed text-[13px] text-faint">
                    · daily and weekly · {basisWord} · {windowFull.length}-month blend + your notes
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="px-[18px] py-[14px] sm:border-r border-b sm:border-b-0 ds2-cell-rule">
                    <p className="font-condensed font-bold text-[12px] tracking-[.14em] uppercase" style={{ color: "var(--color-chart-blue)" }}>
                      Cost to sit
                    </p>
                    <p className="font-condensed font-semibold text-[36.5px] mt-1 tabular-nums">
                      {money(burn.sitDaily)}
                      <span className="font-condensed text-[15px] text-faint"> / day</span>
                    </p>
                    <p className="font-condensed font-semibold text-[18.5px] mt-[2px] tabular-nums text-dim">
                      {money(burn.sitWeekly)}
                      <span className="text-[13px] text-faint"> / week</span>
                    </p>
                    <p className="font-condensed text-[12px] text-faint mt-[6px]">
                      fixed costs + the notes — bleeding whether the truck moves or not
                    </p>
                  </div>
                  <div className="px-[18px] py-[14px]">
                    <p className="font-condensed font-bold text-[12px] tracking-[.14em] uppercase text-amber-hi">
                      Cost to run
                    </p>
                    <p className="font-condensed font-semibold text-[36.5px] mt-1 tabular-nums">
                      {money(burn.runDaily)}
                      <span className="font-condensed text-[15px] text-faint"> / day</span>
                    </p>
                    <p className="font-condensed font-semibold text-[18.5px] mt-[2px] tabular-nums text-dim">
                      {money(burn.runWeekly)}
                      <span className="text-[13px] text-faint"> / week</span>
                    </p>
                    <p className="font-condensed text-[12px] text-faint mt-[6px]">
                      sit + the variable burn — fuel, repairs, the road itself
                    </p>
                  </div>
                </div>
                <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
                  the <b className="text-dim">{money(burn.roadDaily)}/day</b> between them is what
                  the road costs on top of existing — a day parked still burns{" "}
                  {money(burn.sitDaily)}, so a cheap load isn't always cheaper than sitting.
                </div>
              </div>
            )}

            {/* rate to book — the crown jewel */}
            {targets.bookingLadder.breakEven != null && !basisUnsure && (
              <div
                className="ds2-board relative overflow-hidden mt-4"
              >
                <div
                  className="flex items-center gap-[14px] px-[18px] py-[13px] border-b ds2-cell-rule"
                >
                  <div>
                    <div className="font-condensed font-semibold text-[16px] tracking-[.1em] uppercase leading-none">
                      RATE TO BOOK
                    </div>
                    <div className="font-condensed text-[12px] text-faint tracking-[.1em] uppercase mt-[3px]">
                      gross $/mile driven · {floorWord}
                      {targets.basis.basisKind === "committed"
                        ? " · held until you change it"
                        : ` · ${targets.basis.months} of ${targets.basis.monthsWanted} months filed`}{" "}
                      · the number that pays for everything
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-[10px] flex-wrap px-[18px] py-[14px]">
                  <span
                    className="font-condensed font-semibold text-[14.5px] rounded-[8px] px-3 py-[7px] text-dim"
                    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)", boxShadow: "var(--shadow-inset)" }}
                  >
                    <b className="text-ink tabular-nums">${targets.basis.costPerTotalMile?.toFixed(2)}</b> / total
                    mi — your all-in cost
                  </span>
                  <span className="font-condensed text-faint">→</span>
                  <span
                    className="font-condensed font-semibold text-[14.5px] rounded-[8px] px-3 py-[7px] text-dim"
                    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)", boxShadow: "var(--shadow-inset)" }}
                  >
                    ÷ <b className="text-ink">{Math.round(targets.keep * 100)}%</b>{" "}
                    {targets.keepSource === "blended" ? "blended keep" : "linehaul take"}
                  </span>
                  <span className="font-condensed text-faint">→</span>
                  <span
                    className="font-condensed font-semibold text-[14.5px] rounded-[8px] px-3 py-[7px] text-dim"
                    style={{ background: "var(--color-well)", border: "1px solid color-mix(in srgb, var(--color-amber-hi) 55%, transparent)", boxShadow: "var(--shadow-inset)" }}
                  >
                    <b className="font-condensed font-semibold text-[24px] text-amber-hi tabular-nums">
                      ${targets.bookingLadder.breakEven?.toFixed(2)}
                    </b>{" "}
                    break-even
                  </span>
                </div>
                <div className="px-[18px] pb-[14px]">
                  <BandedLadder ladder={targets.bookingLadder} rpm={targets.grossRate} label="Standard flatbed" />
                  <BandedLadder ladder={targets.specLadder} rpm={targets.grossRate} label="Oversize / specialized" />
                </div>
                <div className="px-[18px] py-[9px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
                  break-even = your cost/mile ÷ your {Math.round(targets.keep * 100)}% keep — the share
                  of an all-in dollar that reaches you (linehaul at your split, fuel surcharge and
                  accessorials in full). The same basis, keep and rungs as the Market page and the
                  Dashboard. Book above it with your deadhead folded into the miles and you clear cost.
                </div>
              </div>
            )}

            {periods.length > 1 && !costUnsure && (
              <ExpenseYtdChart periods={periods} obligationsTotal={obligationsTotal} />
            )}

            <CostPerMileTrend
              months={targets.basis.monthsDetail}
              targetMiles={targets.basis.targetMiles}
            />

            {/* fixed vs variable */}
            <div className="ds2-board overflow-hidden mt-4">
              <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                  Fixed vs variable · {selected.period_label} operating
                </span>
                <span className="font-condensed text-[13px] text-faint">
                  · {money(metrics.monthlyCost)}
                </span>
              </div>
              <div className="px-4 pt-3 pb-1">
                <div className="flex h-3 rounded-[4px] overflow-hidden">
                  <div
                    style={{
                      width: `${metrics.fixedPct ? metrics.fixedPct * 100 : 0}%`,
                      background: "var(--color-chart-blue)",
                    }}
                  />
                  <div style={{ flex: 1, background: "var(--color-amber)" }} />
                </div>
              </div>
              <div className="px-4 pb-3 pt-2 font-condensed text-[14px] text-dim flex gap-6 flex-wrap">
                <span>
                  <span style={{ color: "var(--color-chart-blue)" }}>●</span> Fixed{" "}
                  <b className="text-ink tabular-nums">{money(metrics.fixedTotal)}</b>
                </span>
                <span>
                  <span style={{ color: "var(--color-amber)" }}>●</span> Variable{" "}
                  <b className="text-ink tabular-nums">{money(metrics.variableTotal)}</b>
                </span>
                {obligationsTotal > 0 && (
                  <span className="text-faint">
                    operating {money(metrics.monthlyCost)} + notes {money(obligationsTotal)} ={" "}
                    <b className="text-ink">{money(trueMonthly.trueMonthlyCost)}</b> true monthly
                  </span>
                )}
              </div>
            </div>

            {/* Break-even rows only — the P&L bills (insurance, subscriptions)
                live on the Cash Flow page's draft calendar, not here. */}
            {!obligationsFailed && (
              <ObligationsCard items={obligations.filter((o) => !o.on_pl)} onChange={reloadObligations} />
            )}

            <div className="ds2-board p-4 mt-4">
              <p className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint mb-2">
                All expenses · {selected.period_label} — reclassify, edit, add or delete
              </p>
              <ExpenseLedger
                period={selected}
                totalMiles={miles.totalMiles}
                income={selected.income_total}
                onChange={refresh}
              />
            </div>
          </>
        ) : periodFailed ? (
          <FetchFailed className="mt-4" what="this month's P&L" onRetry={refresh} />
        ) : null}

        {/* upload — the popup */}
        {showUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowUpload(false)} />
            <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div
                className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
              >
                <span className="font-condensed font-semibold text-[16px] tracking-[.1em] uppercase">
                  UPLOAD P&L
                </span>
                <button
                  className="ml-auto text-faint hover:text-ink"
                  aria-label="Close"
                  onClick={() => setShowUpload(false)}
                >
                  ✕
                </button>
              </div>
              <div className="p-5">
                <ExpenseUpload
                  onSaved={() => {
                    setShowUpload(false);
                    refresh();
                  }}
                  onCancel={() => setShowUpload(false)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpensesPage;
