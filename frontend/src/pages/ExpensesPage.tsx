import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import {
  getExpensePeriods,
  getExpensePeriod,
} from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import {
  getExpenseMetrics,
  getCashMetrics,
  getTrueMonthly,
} from "@/lib/metrics/expenses";
import {
  getCostBasis,
  getRateLadder,
  monthlyObligationCost,
} from "@/lib/metrics/rateTargets";
import { tiersFrom, specTiersFrom } from "@/lib/constants/targets";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { ExpenseUpload } from "@/components/expenses/ExpenseUpload";
import { ExpenseLedger } from "@/components/expenses/ExpenseLedger";
import { ExpenseYtdChart } from "@/components/expenses/ExpenseYtdChart";
import { ObligationsCard } from "@/components/expenses/ObligationsCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { sitRunCosts } from "@/lib/metrics/sitRun";
import { BandedLadder } from "@/components/ui/BandedLadder";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { money } from "@/lib/format";

// That month's miles from loads (drives cost-per-mile + break-even).
const monthMiles = (loads: Load[], periodMonth: string) => {
  const d = new Date(periodMonth);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const inMonth = loads.filter(
    (l) =>
      l.load_status === "delivered" &&
      l.delivery_date &&
      new Date(l.delivery_date).getUTCFullYear() === year &&
      new Date(l.delivery_date).getUTCMonth() === month,
  );
  const totalMiles = inMonth.reduce(
    (s, l) =>
      s +
      (l.odometer_end != null && l.odometer_start != null
        ? Math.max(0, Number(l.odometer_end) - Number(l.odometer_start)) // guard a reversed/equal reading
        : 0),
    0,
  );
  const loadedMiles = inMonth.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  return { totalMiles, loadedMiles };
};

const ExpensesPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { loads } = useLoads(0);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExpensePeriod | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);

  // Obligations live at the page level so the headline KPIs + chart can fold
  // them into true cost; the card just edits the list and calls this back.
  const reloadObligations = () =>
    getObligations().then(setObligations).catch(() => {});

  useEffect(() => {
    getSettlementSchedule().then(setSchedule).catch(() => {});
  }, []);
  useEffect(() => {
    reloadObligations();
  }, []);

  // Load the period list; keep the current selection if it still exists.
  useEffect(() => {
    let active = true;
    setLoading(true);
    getExpensePeriods()
      .then((ps) => {
        if (!active) return;
        setPeriods(ps);
        setSelectedId((cur) =>
          cur && ps.some((p) => p.period_id === cur)
            ? cur
            : (ps[0]?.period_id ?? null),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Load the selected period's lines.
  useEffect(() => {
    let active = true;
    if (!selectedId) {
      setSelected(null);
      return;
    }
    getExpensePeriod(selectedId)
      .then((p) => {
        if (active) setSelected(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const miles = useMemo(
    () =>
      selected
        ? monthMiles(loads, selected.period_month)
        : { totalMiles: 0, loadedMiles: 0 },
    [selected, loads],
  );
  const metrics = selected
    ? getExpenseMetrics(selected, miles.totalMiles, miles.loadedMiles)
    : null;

  // Blended trailing window: average cost + miles over the selected month and
  // up to 2 prior, so the per-mile figures aren't whipped around by one noisy
  // month. Exposes per-month averages that the cash view divides.
  const trailing = useMemo(() => {
    const idx = periods.findIndex((p) => p.period_id === selectedId);
    const windowPeriods = idx >= 0 ? periods.slice(idx, idx + 3) : [];
    const n = windowPeriods.length;
    let cost = 0;
    let total = 0;
    let loaded = 0;
    for (const p of windowPeriods) {
      cost += (p.cogs_total ?? 0) + (p.expense_total ?? 0);
      const m = monthMiles(loads, p.period_month);
      total += m.totalMiles;
      loaded += m.loadedMiles;
    }
    // Name the window's months so the label says WHICH three, not just "3mo".
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dates = windowPeriods
      .map((p) => new Date(p.period_month))
      .sort((a, b) => a.getTime() - b.getTime());
    const named = dates.map((d) => MONTHS[d.getUTCMonth()]);
    // A gap must LIST months, not fake a range — "May, Jul, Aug", never
    // "May–Aug" when June's P&L is missing.
    const mIdx = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
    const contiguous = dates.every((d, i) => i === 0 || mIdx(d) === mIdx(dates[i - 1]) + 1);
    const label =
      named.length === 0 ? null
      : named.length === 1 ? named[0]
      : contiguous ? `${named[0]}–${named[named.length - 1]}`
      : named.join(", ");
    return {
      months: n || 1,
      label,
      avgCost: n > 0 ? cost / n : 0,
      avgTotalMiles: n > 0 ? total / n : 0,
      avgLoadedMiles: n > 0 ? loaded / n : 0,
    };
  }, [periods, selectedId, loads]);

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
  // Full periods (with lines) for the trailing window, so the sit/run burn can
  // blend the fixed/variable split the same way the per-mile figures blend cost.
  const [windowFull, setWindowFull] = useState<ExpensePeriod[]>([]);
  useEffect(() => {
    let active = true;
    const idx = periods.findIndex((p) => p.period_id === selectedId);
    const ids = (idx >= 0 ? periods.slice(idx, idx + 3) : []).map((p) => p.period_id);
    if (ids.length === 0) {
      setWindowFull([]);
      return;
    }
    Promise.all(ids.map((pid) => getExpensePeriod(pid)))
      .then((ps) => {
        if (active) setWindowFull(ps);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [periods, selectedId, refreshKey]);

  const burn = useMemo(() => {
    if (windowFull.length === 0) return null;
    let fixed = 0;
    let variable = 0;
    for (const p of windowFull) {
      const m = getExpenseMetrics(p, 0, 0);
      fixed += m.fixedTotal;
      variable += m.variableTotal;
    }
    const n = windowFull.length;
    return sitRunCosts(fixed / n, variable / n, obligationsTotal);
  }, [windowFull, obligationsTotal]);

  const trueMonthly =
    metrics && selected
      ? getTrueMonthly(metrics.monthlyCost, obligationsTotal, selected.income_total)
      : null;
  const cash = getCashMetrics(
    trailing.avgCost,
    obligationsTotal,
    trailing.avgTotalMiles,
    trailing.avgLoadedMiles,
  );

  // Rate targets anchored to today (last 3 complete months, NOT the selected
  // month) — forward pricing guidance, same basis as the dashboard card.
  const rateBasis = useMemo(
    () => getCostBasis(periods, obligationsCost, loads, new Date()),
    [periods, obligationsCost, loads],
  );
  const linehaulTake = schedule
    ? Number(schedule.linehaul_pct) + Number(schedule.trailer_pct)
    : 1;
  // Booking ladder in Jason's terms: gross rate to book per mile driven =
  // cost-per-total-mile ÷ keep, scaled by tiers. Marker = actual gross rate/mile.
  const bookingBase =
    rateBasis.costPerTotalMile != null && linehaulTake > 0
      ? rateBasis.costPerTotalMile / linehaulTake
      : null;
  const rateLadder = getRateLadder(bookingBase, tiersFrom(schedule));
  const specRateLadder = getRateLadder(bookingBase, specTiersFrom(schedule));

  const selIncome = selected?.income_total ?? 0;
  const selCost = (selected?.cogs_total ?? 0) + (selected?.expense_total ?? 0);
  const selProfit = selIncome - selCost;
  const selMargin = selIncome > 0 ? selProfit / selIncome : null;
  const isBestMonth =
    selected != null &&
    periods.every((p) => {
      const prof = (p.income_total ?? 0) - ((p.cogs_total ?? 0) + (p.expense_total ?? 0));
      return p.period_id === selected.period_id || prof <= selProfit;
    });

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">EXPENSES</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the books — what it costs to run
          </span>
          <span className="flex-1" />
          {periods.length > 1 && (
            <span
              className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px] overflow-x-auto"
              style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
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
                    className={`px-2.5 rounded-md font-condensed font-semibold text-[12px] whitespace-nowrap ${
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
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow:
                "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
            }}
          >
            UPLOAD P&L
          </button>
        </div>

        {loading ? (
          <div className="mt-4">
            <StatCardsSkeleton count={3} />
            <BlockSkeleton className="h-64 mt-6" />
          </div>
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
              <span className="font-display text-[21px] tracking-[.03em] uppercase">
                {selected.period_label}
              </span>
              <span className="text-[13.5px] text-faint">
                · <b className="font-semibold text-ink tabular-nums">{money(selIncome)}</b> in ·{" "}
                <b className="font-semibold text-ink tabular-nums">{money(selCost)}</b> out ·{" "}
                <b className="font-semibold text-ink tabular-nums">{money(selProfit)}</b> kept
                {selMargin != null && (
                  <>
                    {" "}
                    ·{" "}
                    <b className="font-bold" style={{ color: selMargin >= 0 ? "#6fd08c" : "#e05252" }}>
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
                  { v: money(trueMonthly.trueMonthlyCost), l: "True monthly cost" },
                  { v: money(trueMonthly.trueWeeklyCost), l: "Weekly cost" },
                  {
                    v: cash.trueCpm == null ? "—" : `$${cash.trueCpm.toFixed(2)}`,
                    l: `Cost / total mi · cash · ${trailing.label ?? `${trailing.months}mo`}`,
                  },
                  {
                    v:
                      cash.trueBreakEvenRpm == null
                        ? "—"
                        : `$${cash.trueBreakEvenRpm.toFixed(2)}`,
                    l: `Break-even / loaded mi · cash · ${trailing.label ?? `${trailing.months}mo`}`,
                  },
                  {
                    v:
                      trueMonthly.trueNetMargin == null
                        ? "—"
                        : `${(trueMonthly.trueNetMargin * 100).toFixed(1)}%`,
                    l: "Net margin · app est.",
                    pos: (trueMonthly.trueNetMargin ?? 0) >= 0,
                  },
                ].map((k, ki) => (
                  <div
                    key={k.l}
                    className={`px-4 py-3 ${ki < 4 ? "md:border-r" : ""} ${ki < 2 ? "border-b md:border-b-0" : ""} ds2-cell-rule`}
                  >
                    <p
                      className="font-condensed font-semibold text-[22px] tabular-nums"
                      style={"pos" in k ? { color: k.pos ? "#6fd08c" : "#e05252" } : undefined}
                    >
                      {k.v}
                    </p>
                    <p className="font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint mt-[2px]">
                      {k.l}
                    </p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[11.5px] text-faint">
                <b className="text-dim">Cost / total mile</b> is over every mile you drive;{" "}
                <b className="text-dim">break-even / loaded mile</b> spreads that same cost over
                only the paid miles — the gap is your deadhead. Per-mile figures blend the last{" "}
                {trailing.months} month{trailing.months > 1 ? "s" : ""}.
                {obligationsTotal > 0 &&
                  ` Cost includes ${money(obligationsTotal)}/mo of obligations.`}
              </div>
            </div>

            {/* the burn — sit vs run */}
            {burn && (
              <div className="ds2-board overflow-hidden mt-4">
                <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                  <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                    The burn — sit vs run
                  </span>
                  <span className="font-condensed text-[12px] text-faint">
                    · daily and weekly · {windowFull.length}-month blend + your notes
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="px-[18px] py-[14px] sm:border-r border-b sm:border-b-0 ds2-cell-rule">
                    <p className="font-condensed font-bold text-[11px] tracking-[.14em] uppercase" style={{ color: "#4f8cd6" }}>
                      Cost to sit
                    </p>
                    <p className="font-display text-[34px] tracking-[.02em] mt-1 tabular-nums">
                      {money(burn.sitDaily)}
                      <span className="font-condensed text-[14px] text-faint"> / day</span>
                    </p>
                    <p className="font-condensed font-semibold text-[17px] mt-[2px] tabular-nums text-dim">
                      {money(burn.sitWeekly)}
                      <span className="text-[12px] text-faint"> / week</span>
                    </p>
                    <p className="font-condensed text-[11px] text-faint mt-[6px]">
                      fixed costs + the notes — bleeding whether the truck moves or not
                    </p>
                  </div>
                  <div className="px-[18px] py-[14px]">
                    <p className="font-condensed font-bold text-[11px] tracking-[.14em] uppercase text-amber-hi">
                      Cost to run
                    </p>
                    <p className="font-display text-[34px] tracking-[.02em] mt-1 tabular-nums">
                      {money(burn.runDaily)}
                      <span className="font-condensed text-[14px] text-faint"> / day</span>
                    </p>
                    <p className="font-condensed font-semibold text-[17px] mt-[2px] tabular-nums text-dim">
                      {money(burn.runWeekly)}
                      <span className="text-[12px] text-faint"> / week</span>
                    </p>
                    <p className="font-condensed text-[11px] text-faint mt-[6px]">
                      sit + the variable burn — fuel, repairs, the road itself
                    </p>
                  </div>
                </div>
                <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[11.5px] text-faint">
                  the <b className="text-dim">{money(burn.roadDaily)}/day</b> between them is what
                  the road costs on top of existing — a day parked still burns{" "}
                  {money(burn.sitDaily)}, so a cheap load isn't always cheaper than sitting.
                </div>
              </div>
            )}

            {/* rate to book — the crown jewel */}
            {rateLadder.walkAway != null && (
              <div
                className="relative overflow-hidden rounded-[14px] border mt-4"
                style={{
                  background: "linear-gradient(180deg, #0e1420, #0b101a)",
                  borderColor: "var(--color-hairline)",
                  boxShadow: "0 14px 34px rgba(0,0,0,.45)",
                }}
              >
                <div
                  className="flex items-center gap-[14px] px-[18px] py-[13px] border-b ds2-cell-rule"
                  style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
                >
                  <div>
                    <div className="font-forge font-bold text-[20px] leading-none" style={{ letterSpacing: "1.5px" }}>
                      RATE TO BOOK
                    </div>
                    <div className="font-condensed text-[11px] text-faint tracking-[.1em] uppercase mt-[3px]">
                      gross $/mile driven · last {rateBasis.months} complete month
                      {rateBasis.months > 1 ? "s" : ""} · the number that pays for everything
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-[10px] flex-wrap px-[18px] py-[14px]">
                  <span
                    className="font-condensed font-semibold text-[13.5px] rounded-[8px] px-3 py-[7px] text-dim"
                    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
                  >
                    <b className="text-ink tabular-nums">${rateBasis.costPerTotalMile?.toFixed(2)}</b> / total
                    mi — your all-in cost
                  </span>
                  <span className="font-condensed text-faint">→</span>
                  <span
                    className="font-condensed font-semibold text-[13.5px] rounded-[8px] px-3 py-[7px] text-dim"
                    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
                  >
                    ÷ <b className="text-ink">{Math.round(linehaulTake * 100)}%</b> keep
                  </span>
                  <span className="font-condensed text-faint">→</span>
                  <span
                    className="font-condensed font-semibold text-[13.5px] rounded-[8px] px-3 py-[7px] text-dim"
                    style={{ background: "var(--color-well)", border: "1px solid rgba(245,176,58,.55)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
                  >
                    <b className="font-display text-[22px] tracking-[.04em] text-amber-hi tabular-nums">
                      ${rateLadder.walkAway?.toFixed(2)}
                    </b>{" "}
                    walk-away
                  </span>
                </div>
                <div className="px-[18px] pb-[14px]">
                  <BandedLadder
                    ladder={rateLadder}
                    rpm={rateBasis.grossPerTotalMile}
                    label="Standard flatbed"
                  />
                  <BandedLadder ladder={specRateLadder} rpm={rateBasis.grossPerTotalMile} label="Oversize / specialized" />
                </div>
                <div className="px-[18px] py-[9px] border-t ds2-cell-rule font-condensed text-[11.5px] text-faint">
                  walk-away = your cost/mile ÷ your {Math.round(linehaulTake * 100)}% keep. Book
                  above it with your deadhead folded into the miles and you clear cost.
                </div>
              </div>
            )}

            {periods.length > 1 && (
              <ExpenseYtdChart periods={periods} obligationsTotal={obligationsTotal} />
            )}

            {/* fixed vs variable */}
            <div className="ds2-board overflow-hidden mt-4">
              <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                  Fixed vs variable · {selected.period_label} operating
                </span>
                <span className="font-condensed text-[12px] text-faint">
                  · {money(metrics.monthlyCost)}
                </span>
              </div>
              <div className="px-4 pt-3 pb-1">
                <div className="flex h-3 rounded-[4px] overflow-hidden">
                  <div
                    style={{
                      width: `${metrics.fixedPct ? metrics.fixedPct * 100 : 0}%`,
                      background: "#4f8cd6",
                    }}
                  />
                  <div style={{ flex: 1, background: "var(--color-amber)" }} />
                </div>
              </div>
              <div className="px-4 pb-3 pt-2 font-condensed text-[13px] text-dim flex gap-6 flex-wrap">
                <span>
                  <span style={{ color: "#4f8cd6" }}>●</span> Fixed{" "}
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
            <ObligationsCard items={obligations.filter((o) => !o.on_pl)} onChange={reloadObligations} />

            <div className="ds2-board p-4 mt-4">
              <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint mb-2">
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
        ) : null}

        {/* upload — the forged popup */}
        {showUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowUpload(false)} />
            <div className="relative w-full max-w-[640px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl">
              <div
                className="flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule"
                style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
              >
                <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>
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
