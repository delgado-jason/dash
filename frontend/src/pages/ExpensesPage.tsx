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
import { getCostBasis, getRateLadder } from "@/lib/metrics/rateTargets";
import { RATE_TIERS } from "@/lib/constants/targets";
import { RateLadder } from "@/components/dashboard/RateLadder";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { ExpenseUpload } from "@/components/expenses/ExpenseUpload";
import { ExpenseLedger } from "@/components/expenses/ExpenseLedger";
import { ExpenseYtdChart } from "@/components/expenses/ExpenseYtdChart";
import { ObligationsCard } from "@/components/expenses/ObligationsCard";
import { Panel } from "@/components/ui/Panel";

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

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
        ? Number(l.odometer_end) - Number(l.odometer_start)
        : 0),
    0,
  );
  const loadedMiles = inMonth.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  return { totalMiles, loadedMiles };
};

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <Panel className="p-4">
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-2xl font-condensed mt-1">{value}</p>
  </Panel>
);

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
    return {
      months: n || 1,
      avgCost: n > 0 ? cost / n : 0,
      avgTotalMiles: n > 0 ? total / n : 0,
      avgLoadedMiles: n > 0 ? loaded / n : 0,
    };
  }, [periods, selectedId, loads]);

  // Obligations folded into every headline number. Dollar figures use this
  // month (reconcile with the month's P&L); per-mile figures use the trailing
  // blend. obligationsTotal = 0 → these equal the operating-only numbers.
  const obligationsTotal = useMemo(
    () => obligations.filter((o) => o.active).reduce((s, o) => s + o.amount, 0),
    [obligations],
  );
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
    () => getCostBasis(periods, obligationsTotal, loads, new Date()),
    [periods, obligationsTotal, loads],
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
  const rateLadder = getRateLadder(bookingBase, RATE_TIERS);

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-3xl font-condensed min-w-0">
          Expenses
          {selected?.period_label ? ` · ${selected.period_label}` : ""}
        </h1>
        {!showUpload && (
          <button
            className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold"
            onClick={() => setShowUpload(true)}
          >
            Upload P&amp;L
          </button>
        )}
      </div>

      {showUpload && (
        <ExpenseUpload
          onSaved={() => {
            setShowUpload(false);
            refresh();
          }}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {loading ? (
        <p className="text-muted-text">Loading...</p>
      ) : periods.length === 0 ? (
        <p className="text-muted-text">
          No P&amp;L uploaded yet. Upload one to get started.
        </p>
      ) : selected && metrics && trueMonthly ? (
        <>
          {periods.length > 1 && (
            <div className="flex gap-1 mb-4 flex-wrap">
              {[...periods].reverse().map((p) => (
                <button
                  key={p.period_id}
                  onClick={() => setSelectedId(p.period_id)}
                  className={`px-2 py-1 rounded text-xs ${
                    selectedId === p.period_id
                      ? "bg-amber text-steel"
                      : "bg-plate text-muted-text"
                  }`}
                >
                  {p.period_label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Kpi label="Monthly cost" value={money(trueMonthly.trueMonthlyCost)} />
            <Kpi label="Weekly cost" value={money(trueMonthly.trueWeeklyCost)} />
            <Kpi
              label={`Cost / total mile · ${trailing.months}mo`}
              value={cash.trueCpm == null ? "—" : `$${cash.trueCpm.toFixed(2)}`}
            />
            <Kpi
              label={`Break-even / loaded mi · ${trailing.months}mo`}
              value={
                cash.trueBreakEvenRpm == null
                  ? "—"
                  : `$${cash.trueBreakEvenRpm.toFixed(2)}`
              }
            />
            <Kpi
              label="Net margin"
              value={
                trueMonthly.trueNetMargin == null
                  ? "—"
                  : `${(trueMonthly.trueNetMargin * 100).toFixed(1)}%`
              }
            />
          </div>
          <p className="text-[11px] text-muted-text -mt-4 mb-6">
            <span className="text-light">Cost / total mile</span> is over every mile
            you drive; <span className="text-light">break-even / loaded mile</span>{" "}
            spreads that same cost over only the paid miles — the gap is your
            deadhead. Per-mile figures blend the last {trailing.months} month
            {trailing.months > 1 ? "s" : ""}.
            {obligationsTotal > 0 &&
              ` Cost includes ${money(obligationsTotal)}/mo of obligations (loan principal + draws).`}
          </p>

          {rateLadder.walkAway != null && (
            <Panel className="p-4 mb-6">
              <p className="text-xs text-muted-text mb-3">
                Rate to book · gross $/mile driven · last {rateBasis.months}{" "}
                complete month{rateBasis.months > 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2 flex-wrap mb-3 text-[11px]">
                <span
                  className="rounded px-2 py-1"
                  style={{ background: "#0d1119", border: "1px solid #22304a" }}
                >
                  <span className="text-light font-condensed">
                    {`$${rateBasis.costPerTotalMile?.toFixed(2)}`}
                  </span>{" "}
                  <span className="text-muted-text">/ total mi</span>
                </span>
                <span className="text-muted-text">→</span>
                <span
                  className="rounded px-2 py-1 text-muted-text"
                  style={{ background: "#0d1119", border: "1px solid #22304a" }}
                >
                  ÷ {Math.round(linehaulTake * 100)}% keep
                </span>
                <span className="text-muted-text">→</span>
                <span
                  className="rounded px-2 py-1"
                  style={{ background: "#0d1119", border: "1px solid #22304a" }}
                >
                  <span className="font-condensed" style={{ color: "#f5b03a" }}>
                    {`$${rateLadder.walkAway?.toFixed(2)}`}
                  </span>{" "}
                  <span className="text-muted-text">to book</span>
                </span>
              </div>
              <RateLadder ladder={rateLadder} rpm={rateBasis.grossPerTotalMile} />
              <p className="text-[11px] text-muted-text mt-2">
                walk-away = your cost/mile ÷ your{" "}
                {Math.round(linehaulTake * 100)}% keep. Book above it with your
                deadhead folded into the miles and you clear cost.
              </p>
            </Panel>
          )}

          {periods.length > 1 && (
            <ExpenseYtdChart periods={periods} obligationsTotal={obligationsTotal} />
          )}

          <Panel className="p-4 mb-6 mt-6">
            <p className="text-xs text-muted-text mb-2">
              Fixed vs variable · P&amp;L operating · {money(metrics.monthlyCost)}
            </p>
            <div className="flex h-3 rounded overflow-hidden mb-2">
              <div
                style={{
                  width: `${metrics.fixedPct ? metrics.fixedPct * 100 : 0}%`,
                  background: "#378add",
                }}
              />
              <div style={{ flex: 1, background: "#e8940a" }} />
            </div>
            <div className="text-sm flex gap-6">
              <span>
                <span style={{ color: "#378add" }}>●</span> Fixed{" "}
                {money(metrics.fixedTotal)}
              </span>
              <span>
                <span style={{ color: "#e8940a" }}>●</span> Variable{" "}
                {money(metrics.variableTotal)}
              </span>
            </div>
            {obligationsTotal > 0 && (
              <p className="text-[11px] text-muted-text mt-2">
                Operating {money(metrics.monthlyCost)} + obligations{" "}
                {money(obligationsTotal)} ={" "}
                <span className="text-light">
                  {money(trueMonthly.trueMonthlyCost)}
                </span>{" "}
                true monthly cost
              </p>
            )}
          </Panel>

          <ObligationsCard items={obligations} onChange={reloadObligations} />

          <Panel className="p-4 mb-6">
            <p className="text-xs text-muted-text mb-2">
              All expenses · reclassify, edit value, add or delete
            </p>
            <ExpenseLedger
              period={selected}
              totalMiles={miles.totalMiles}
              income={selected.income_total}
              onChange={refresh}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
};

export default ExpensesPage;
