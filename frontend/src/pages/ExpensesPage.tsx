import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import {
  getExpensePeriods,
  getExpensePeriod,
} from "@/services/expensesService";
import { getExpenseMetrics } from "@/lib/metrics/expenses";
import { ExpenseUpload } from "@/components/expenses/ExpenseUpload";
import { ExpenseLedger } from "@/components/expenses/ExpenseLedger";
import { ExpenseYtdChart } from "@/components/expenses/ExpenseYtdChart";

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
  <div className="bg-plate rounded-lg p-4">
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-2xl font-condensed mt-1">{value}</p>
  </div>
);

const ExpensesPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { loads } = useLoads(0);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExpensePeriod | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed">
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
      ) : selected && metrics ? (
        <>
          {periods.length > 1 && (
            <div className="flex gap-1 mb-4 flex-wrap">
              {periods.map((p) => (
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
            <Kpi label="Monthly cost" value={money(metrics.monthlyCost)} />
            <Kpi label="Weekly cost" value={money(metrics.weeklyCost)} />
            <Kpi
              label="Cost / mile"
              value={metrics.cpm == null ? "—" : `$${metrics.cpm.toFixed(2)}`}
            />
            <Kpi
              label="Break-even RPM"
              value={
                metrics.breakEvenRpm == null
                  ? "—"
                  : `$${metrics.breakEvenRpm.toFixed(2)}`
              }
            />
            <Kpi
              label="Net margin"
              value={
                metrics.netMargin == null
                  ? "—"
                  : `${(metrics.netMargin * 100).toFixed(1)}%`
              }
            />
          </div>

          {periods.length > 1 && <ExpenseYtdChart periods={periods} />}

          <div className="bg-plate rounded-lg p-4 mb-6 mt-6">
            <p className="text-xs text-muted-text mb-2">
              Fixed vs variable · {money(metrics.monthlyCost)}
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
          </div>

          <div className="bg-plate rounded-lg p-4 mb-6">
            <p className="text-xs text-muted-text mb-2">
              All expenses · reclassify, edit value, add or delete
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
    </div>
  );
};

export default ExpensesPage;
