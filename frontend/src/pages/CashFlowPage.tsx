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
import { getPlans, getAccounts, getSnapshots } from "@/services/planService";
import type { PlanRow, AccountRow, SnapshotRow } from "@/services/planService";
import {
  getCashAssumptions, patchCashAssumptions,
  getMonthlyFinancials, upsertMonthlyFinancials,
  getForecastAdjustments, setForecastAdjustment,
} from "@/services/cashflowService";
import type { CashAssumptionsRow, MonthlyFinancialRow } from "@/services/cashflowService";
import {
  twoWeekLiquidity, buildForecast, pretaxMargin, keyOf,
} from "@/lib/metrics/cashflow";
import type { LiquidityWeek } from "@/lib/metrics/cashflow";
import { parseFinancialRows, FINANCIAL_COLUMNS } from "@/lib/parseFinancials";
import { dayKey as localDayKey } from "@/lib/perDiem";
import type { Obligation } from "@/types/obligation";

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
const dayLabel = (k: string): string => {
  const d = new Date(`${k}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

const CashFlowPage = () => {
  const { loads } = useLoads(0);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [assumptions, setAssumptions] = useState<CashAssumptionsRow | null>(null);
  const [financials, setFinancials] = useState<MonthlyFinancialRow[]>([]);
  const [adjustments, setAdjustments] = useState<Map<string, number>>(new Map());
  const [settlementDay, setSettlementDay] = useState<number | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Planning scratch — page-local, not persisted.
  const [beginOverride, setBeginOverride] = useState<number | null>(null);
  const [setlOverride, setSetlOverride] = useState<[number | null, number | null]>([null, null]);
  const [editing, setEditing] = useState<string | null>(null); // which cell is an input
  const [showPaste, setShowPaste] = useState(false);
  const [showAssume, setShowAssume] = useState(false);
  const [showBills, setShowBills] = useState(false);

  const [loadError, setLoadError] = useState(false);

  // allSettled, not all: one flaky call must not throw away the other seven
  // and render a stocked page as brand-new onboarding.
  const load = () =>
    Promise.allSettled([
      getObligations(), getCashAssumptions(), getMonthlyFinancials(),
      getForecastAdjustments(), getSettlementSchedule(),
      getPlans(), getAccounts(), getSnapshots(),
    ])
      .then(([o, a, f, adj, sched, p, acc, snaps]) => {
        if (o.status === "fulfilled") setObligations(o.value);
        if (a.status === "fulfilled") setAssumptions(a.value);
        if (f.status === "fulfilled") setFinancials(f.value);
        if (adj.status === "fulfilled")
          setAdjustments(new Map(adj.value.map((r) => [r.month.slice(0, 10), Number(r.weeks_off)])));
        if (sched.status === "fulfilled") setSettlementDay(sched.value?.settlement_day ?? null);
        if (p.status === "fulfilled") setPlans(p.value);
        if (acc.status === "fulfilled") setAccounts(acc.value);
        if (snaps.status === "fulfilled") setSnapshots(snaps.value);
        // The schedule 404s harmlessly for a fresh user — every other failure
        // deserves a visible flag, not a silently emptier page.
        setLoadError(
          [o, a, f, adj, p, acc, snaps].some((r) => r.status === "rejected"),
        );
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const plan = useMemo(() => plans.find((p) => p.active) ?? plans[0] ?? null, [plans]);
  const floatLine = plan ? Number(plan.float_line) : null;

  // Week 1 beginning = the latest Friday snapshot's OPS balance (bills draft
  // from ops; the vault is protected by design) — overridable on the board.
  const latestSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const opsAcct = accounts.filter((a) => a.active).find((a) => a.role === "ops") ?? null;
  const snapOps = useMemo(() => {
    if (!latestSnap || !opsAcct) return null;
    const b = latestSnap.balances.find((x) => x.account_id === opsAcct.account_id);
    return b == null ? null : Number(b.balance);
  }, [latestSnap, opsAcct]);

  // The operator's LOCAL calendar day — a US evening is already tomorrow in
  // UTC, which would start the board a day late and drop tonight's drafts.
  const asOfKey = useMemo(() => localDayKey(new Date()), []);
  const beginning = beginOverride ?? snapOps;

  const liquidity = useMemo(() => {
    if (beginning == null || !assumptions) return null;
    return twoWeekLiquidity({
      asOfKey,
      beginning,
      obligations,
      weeklyPayroll: Number(assumptions.weekly_payroll),
      loads: loads ?? [],
      settlementDay,
      weeklyRevenueFallback: Number(assumptions.weekly_revenue),
      weeklyFuelAdvance: Number(assumptions.weekly_fuel_advance ?? 0),
      weeklySettlementDeductions: Number(assumptions.weekly_settlement_deductions ?? 0),
      overrides: setlOverride,
    });
  }, [beginning, assumptions, obligations, loads, settlementDay, asOfKey, setlOverride]);

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

  const clears = liquidity != null && floatLine != null ? liquidity.lowestEnding >= floatLine : null;
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

  // Day strip: 14 days from as-of; a bill's draft day carries its chip, the
  // settlement day carries the inflow marker.
  const stripDays = useMemo(() => {
    if (!liquidity) return [];
    const days: { key: string; bills: { label: string; amount: number }[]; settle: boolean }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(new Date(`${asOfKey}T00:00:00Z`).getTime() + i * 86_400_000);
      const key = keyOf(d);
      const bills = liquidity.weeks[i < 7 ? 0 : 1].bills
        .filter((b) => b.draftKey === key)
        .map((b) => ({ label: b.label, amount: b.amount }));
      days.push({ key, bills, settle: settlementDay != null && d.getUTCDay() === settlementDay });
    }
    return days;
  }, [liquidity, asOfKey, settlementDay]);

  if (loading)
    return <div className="text-sm text-muted-text py-12 text-center">Loading the cash picture…</div>;

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
          {clears != null && liquidity ? (
            <>
              <span
                className="font-display text-[21px] tracking-[.04em] rounded-[8px] px-3 pt-[3px] pb-[1px] border-2"
                style={{
                  color: clears ? "var(--color-ok)" : "var(--color-warn)",
                  borderColor: clears ? "rgba(111,208,140,.45)" : "rgba(224,82,82,.5)",
                  background: clears ? "rgba(111,208,140,.06)" : "rgba(224,82,82,.07)",
                  transform: "rotate(-1.2deg)",
                }}
              >
                {clears ? "CLEARS THE LINE" : "BELOW THE LINE"}
              </span>
              <span className="text-[13.5px] text-faint">
                · lowest point <b className="font-semibold text-ink tabular-nums">{money(liquidity.lowestEnding)}</b>
                {floatLine != null && (
                  <> {clears ? "over" : "under"} the <b className="font-semibold text-ink">{money(floatLine)}</b> float</>
                )}
                {ytdMargin != null && (
                  <> · YTD pretax margin <b className="font-semibold text-ink tabular-nums">{(ytdMargin * 100).toFixed(1)}%</b></>
                )}
              </span>
            </>
          ) : (
            <span className="text-[13.5px] text-faint">
              forges after a Friday snapshot sets your ops balance — or tap Beginning to set it by hand
            </span>
          )}
        </div>

        {/* THE NEXT TWO WEEKS */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div
            className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule flex-wrap"
            style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
          >
            <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>
              THE NEXT TWO WEEKS
            </span>
            <button
              onClick={() => setShowBills(true)}
              className="font-condensed font-semibold text-[11px] tracking-[.12em] uppercase text-amber-hi hover:text-hot"
            >
              Edit bills ▸
            </button>
            <span className="ml-auto font-condensed text-[12px] text-faint">
              beginning ={" "}
              {snapOps != null && beginOverride == null ? (
                <>latest snapshot ops <b className="text-dim tabular-nums">{moneyCents(snapOps)}</b>
                  {latestSnap && <> · {latestSnap.as_of.slice(0, 10)}</>}</>
              ) : beginOverride != null ? (
                <>override <b className="text-dim tabular-nums">{moneyCents(beginOverride)}</b>{" "}
                  <button className="text-amber-hi hover:text-hot" onClick={() => setBeginOverride(null)}>✕</button></>
              ) : (
                "no snapshot yet"
              )}
              {" · "}tap a value to override
            </span>
          </div>

          {liquidity ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] tabular-nums" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint">
                      <th className="text-left px-4 py-2 border-b border-hairline"></th>
                      {liquidity.weeks.map((w, i) => (
                        <th key={i} className="text-right px-4 py-2 border-b border-hairline whitespace-nowrap">
                          WK {i + 1} · {dayLabel(w.startKey)} – {dayLabel(w.endKey)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <Row label="Beginning">
                      {liquidity.weeks.map((w, i) => (
                        <td key={i} className="text-right px-4 py-2 border-b border-hairline-lo">
                          {i === 0 ? (
                            <EditCell
                              id="begin"
                              editing={editing}
                              setEditing={setEditing}
                              value={w.beginning}
                              onCommit={(v) => setBeginOverride(v)}
                            />
                          ) : (
                            moneyCents(w.beginning)
                          )}
                        </td>
                      ))}
                    </Row>
                    <Row
                      label={
                        <span>
                          Settlements
                          <SourceChip week={liquidity.weeks[0]} other={liquidity.weeks[1]} />
                        </span>
                      }
                    >
                      {liquidity.weeks.map((w, i) => (
                        <td key={i} className="text-right px-4 py-2 border-b border-hairline-lo font-semibold" style={{ color: "var(--color-ok)" }}>
                          <EditCell
                            id={`setl${i}`}
                            editing={editing}
                            setEditing={setEditing}
                            value={w.settlements}
                            prefix="+"
                            onCommit={(v) =>
                              setSetlOverride((prev) => (i === 0 ? [v, prev[1]] : [prev[0], v]))
                            }
                          />
                          {w.settlementSource === "override" && (
                            <button
                              className="ml-1 text-amber-hi hover:text-hot text-[11px]"
                              onClick={() => setSetlOverride((prev) => (i === 0 ? [null, prev[1]] : [prev[0], null]))}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      ))}
                    </Row>
                    <Row
                      label={
                        <span>
                          Holdbacks
                          <span className="ml-2 font-condensed text-[10px] text-faint normal-case tracking-normal">
                            fuel advance + avg deductions
                          </span>
                        </span>
                      }
                    >
                      {liquidity.weeks.map((w, i) => <Neg key={i} v={w.holdback} />)}
                    </Row>
                    <Row label="Payroll">{liquidity.weeks.map((w, i) => <Neg key={i} v={w.payroll} />)}</Row>
                    <Row label="Loan / lease">{liquidity.weeks.map((w, i) => <Neg key={i} v={w.loanLease} />)}</Row>
                    <Row label="Insurance">{liquidity.weeks.map((w, i) => <Neg key={i} v={w.insurance} />)}</Row>
                    <Row label="Other">{liquidity.weeks.map((w, i) => <Neg key={i} v={w.other} />)}</Row>
                    <tr>
                      <td className="text-left px-4 pt-2.5 pb-3 font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint border-t border-hairline">
                        Ending
                      </td>
                      {liquidity.weeks.map((w, i) => (
                        <td key={i} className="text-right px-4 pt-2.5 pb-3 border-t border-hairline">
                          <span className="font-display text-[22px] tracking-[.03em]" style={{ color: endTone(w.ending) }}>
                            {moneyCents(w.ending)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* day strip */}
              <div className="grid gap-1 px-4 pt-1 pb-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(68px, 1fr))" }}>
                {stripDays.map((d, i) => (
                  <div
                    key={d.key}
                    className="rounded-[6px] px-1.5 py-1 min-h-[58px] text-[10px]"
                    style={{
                      background: d.settle ? "rgba(232,148,10,.07)" : "var(--color-well)",
                      border: d.settle ? "1px solid rgba(232,148,10,.5)" : "1px solid var(--color-hairline-lo)",
                      outline: i === 0 ? "2px solid var(--color-amber)" : undefined,
                    }}
                  >
                    <span className="font-condensed font-semibold text-[10px] text-faint uppercase">
                      {dayLabel(d.key)}
                    </span>
                    {d.settle && <div style={{ color: "var(--color-ok)" }}>▲ settlement</div>}
                    {d.bills.map((b) => (
                      <div key={b.label} style={{ color: "#f08a8a" }} className="leading-[1.3]">
                        ▼ {b.label} {Math.round(b.amount)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="px-4 pb-3 font-condensed text-[11px] text-faint">
                ▲ Wednesday settlement lands · ▼ bill drafts · amber ring = today · ENDING turns{" "}
                <span style={{ color: "var(--color-warn)" }}>red</span> under the float
                {floatLine != null && <> ({money(floatLine)} — the plan’s line, edited on <Link to="/status" className="text-amber-hi hover:text-hot">Status</Link>)</>}
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
                  {beginning == null && " — and a beginning balance"}.
                </>
              ) : (
                <>
                  Needs a beginning balance — take a{" "}
                  <Link to="/status" className="text-amber-hi hover:text-hot">Friday snapshot</Link> or{" "}
                  <button
                    className="text-amber-hi hover:text-hot"
                    onClick={() => {
                      const v = window.prompt("Beginning cash (ops) for week 1:");
                      const n = v == null ? NaN : Number(v.replace(/[$,]/g, ""));
                      if (Number.isFinite(n)) setBeginOverride(n);
                    }}
                  >
                    set it by hand
                  </button>
                  .
                </>
              )}
            </p>
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

const Row = ({ label, children }: { label: React.ReactNode; children: React.ReactNode }) => (
  <tr>
    <td className="text-left px-4 py-2 border-b border-hairline-lo font-condensed text-[13px] text-dim">{label}</td>
    {children}
  </tr>
);

const Neg = ({ v }: { v: number }) => (
  <td className="text-right px-4 py-2 border-b border-hairline-lo text-dim">
    {v === 0 ? "0.00" : `−${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
  </td>
);

const SourceChip = ({ week, other }: { week: LiquidityWeek; other: LiquidityWeek }) => {
  const anyOverride = week.settlementSource === "override" || other.settlementSource === "override";
  const anyLoads = week.settlementSource === "loads" || other.settlementSource === "loads";
  const label = anyOverride ? "manual override" : anyLoads ? `${week.settlementLoads + other.settlementLoads} loads projected` : "fallback — no loads booked";
  return (
    <span className="ml-2 font-condensed text-[10.5px] font-semibold tracking-[.08em] uppercase px-2 rounded-full border" style={{ color: "var(--color-amber-hi)", borderColor: "rgba(232,148,10,.4)", background: "rgba(232,148,10,.08)" }}>
      {label}
    </span>
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

export default CashFlowPage;
