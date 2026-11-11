import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import {
  getPerDiemDays,
  setPerDiemDay,
  clearPerDiemDay,
} from "@/services/perDiemService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import {
  inferredOutDays,
  effectiveStatus,
  computePerDiem,
  nextStatus,
  FULL_DEFAULT_SINCE,
} from "@/lib/perDiem";
import type { PerDiemStatus } from "@/types/perDiem";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { money } from "@/lib/format";
import { getPerDiemRates } from "@/services/perDiemRateService";
import { getObligations } from "@/services/obligationsService";
import { getCashAssumptions } from "@/services/cashflowService";
import { FortnightCost } from "@/components/perdiem/FortnightCost";
import { getHomeDays } from "@/services/perDiemService";
import { useRateTargets } from "@/hooks/useRateTargets";
import { daysOutIn, contributionPerDayOut } from "@/lib/metrics/pace";
import type { Obligation } from "@/types/obligation";
import type { PerDiemRate } from "@/types/perDiemRate";
import { segmentWords, missingDaysWords, ratesWords } from "@/lib/perDiem/rates";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { MissingInputLine } from "@/components/integrity/MissingInput";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

const AMBER = "var(--color-amber)";
const HALF_BG = `linear-gradient(135deg, ${AMBER} 0 50%, var(--color-well) 50% 100%)`;

const AUTO_FULL_STYLE: CSSProperties = {
  background: "color-mix(in srgb, var(--color-amber-hi) 30%, transparent)",
  color: "var(--color-amber-hi)",
  fontWeight: 600,
  border: "1px solid color-mix(in srgb, var(--color-amber-hi) 28%, transparent)",
};

const cellStyle = (
  eff: PerDiemStatus,
  inferred: boolean,
  autoFull: boolean,
  future: boolean,
  planned = false,
): CSSProperties => {
  // A day he INTENDS to be home (107). Dashed, in the home colour: the dash
  // says "not yet true", which is the same grammar the inferred-day mark uses.
  // The deduction never counts it, so it can sit on the calendar honestly.
  if (planned)
    return {
      background: "transparent",
      border: "1.5px dashed var(--color-chart-blue)",
      color: "var(--color-chart-blue)",
      fontWeight: 600,
    };
  if (future)
    return { background: "transparent", border: "1px dashed var(--color-hairline-lo)", color: "var(--color-faint)" };
  // Post-flip unmarked: counts FULL automatically — subdued amber so the wall
  // of default days doesn't shout, while explicit marks stay solid.
  if (autoFull) return AUTO_FULL_STYLE;
  // The ghost rule, applied to data: visible, not yet confirmed, tap to claim.
  if (inferred)
    return { background: "transparent", border: "1.5px dashed var(--color-amber-hi)", color: "var(--color-amber-hi)", fontWeight: 600 };
  if (eff === "full") return { background: AMBER, color: "var(--color-on-amber)", fontWeight: 700 };
  if (eff === "half") return { background: HALF_BG, color: "var(--color-on-amber)", border: "1px solid var(--color-hairline-lo)" };
  return { background: "var(--color-well)", color: "var(--color-dim)", border: "1px solid var(--color-hairline)" }; // home / unmarked
};

const Sw = ({ style, label }: { style: CSSProperties; label: string }) => (
  <span className="inline-flex items-center gap-1">
    <span className="inline-block w-3 h-3 rounded-[3px]" style={style} />
    {label}
  </span>
);

const PerDiemPage = () => {
  const { loads } = useLoads(0);
  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const curYear = now.getFullYear();

  const [year, setYear] = useState(curYear);
  const [manual, setManual] = useState<Map<string, PerDiemStatus>>(new Map());
  // The days he has told dash he will be HOME (107). Kept apart from `manual`
  // so nothing that reads a status can mistake a plan for a day that happened.
  const [plannedDays, setPlannedDays] = useState<Set<string>>(new Set());
  // What a planned stretch actually costs: the bills that draft on those dates
  // and the payroll that drafts every week regardless (call 4). Both non-fatal
  // — the readout simply does not appear without them.
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [weeklyPayroll, setWeeklyPayroll] = useState<number | null>(null);
  // Every home day marked, any year — the basis window can straddle a year
  // boundary, and counting days out off the selected year alone would overstate
  // them and so understate what a day out is worth.
  const [allHomeDays, setAllHomeDays] = useState<string[]>([]);
  useEffect(() => {
    getHomeDays()
      .then(setAllHomeDays)
      .catch(() => setAllHomeDays([]));
  }, []);

  // What a day with the truck moving actually earns, after the fuel and wear
  // it burns. The basis already sums its window's driven miles, so dividing
  // those by the days NOT at home over the same months gives the daily pace
  // without re-walking a single odometer.
  const rateTargets = useRateTargets(loads);
  const dayWorth = useMemo(() => {
    const b = rateTargets?.basis;
    if (!b || b.totalMiles <= 0) return null;
    const out = daysOutIn(b.monthsDetail, allHomeDays);
    if (out <= 0) return null;
    return contributionPerDayOut(b.totalMiles / out, b.netPerTotalMile, b.variablePerMile);
  }, [rateTargets, allHomeDays]);
  useEffect(() => {
    getObligations().then(setObligations).catch(() => {});
    getCashAssumptions()
      .then((a) => setWeeklyPayroll(a == null ? null : Number(a.weekly_payroll)))
      .catch(() => {});
  }, []);
  const [rates, setRates] = useState<PerDiemRate[] | null>(null); // null = not loaded yet
  const [ratesFailed, setRatesFailed] = useState(false);
  const [deductPct, setDeductPct] = useState(0.8);
  const [pctFailed, setPctFailed] = useState(false);

  useEffect(() => {
    getPerDiemDays(year)
      .then((days) => {
        setManual(new Map(days.map((d) => [d.day, d.status])));
        setPlannedDays(new Set(days.filter((d) => d.planned).map((d) => d.day)));
      })
      .catch(() => {});
  }, [year]);

  useEffect(() => {
    getPerDiemRates()
      .then(setRates)
      .catch(() => setRatesFailed(true));
  }, []);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setDeductPct(s.per_diem_deduct_pct))
      .catch(() => setPctFailed(true));
  }, []);

  // Retry handlers (event handlers — the flags reset here, never in an effect).
  const retryRates = () => {
    setRatesFailed(false);
    getPerDiemRates()
      .then(setRates)
      .catch(() => setRatesFailed(true));
  };
  const retryPct = () => {
    setPctFailed(false);
    getSettlementSchedule()
      .then((s) => setDeductPct(s.per_diem_deduct_pct))
      .catch(() => setPctFailed(true));
  };

  // Count/infer only through today (or the year's end for a past year).
  const cap = useMemo(() => {
    const eoy = new Date(year, 11, 31);
    return eoy < now ? eoy : now;
  }, [year, now]);

  // Which era(s) the board on screen spans — the header rule and the legend
  // must describe THIS year's behavior, not the current one's.
  const flipYear = Number(FULL_DEFAULT_SINCE.slice(0, 4));

  const inferred = useMemo(
    () => inferredOutDays(loads ?? [], year, cap),
    [loads, year, cap],
  );
  const summary = useMemo(
    () => (rates == null ? null : computePerDiem(manual, inferred, rates, deductPct, year, cap)),
    [manual, inferred, rates, deductPct, year, cap],
  );
  const pctWords = Math.round(deductPct * 100);
  const deductibleText = summary && summary.deductible != null ? money(summary.deductible) : "—";

  // A FUTURE day can only ever be a plan: "full" and "half" are tax marks for
  // days that happened, and the table's own CHECK refuses a planned day that
  // is not `home`. So a tap out there toggles the plan on and off, nothing
  // else. Optimistic, reverting on failure like the cycle below.
  const togglePlanned = async (key: string) => {
    const was = plannedDays.has(key);
    const next = new Set(plannedDays);
    if (was) next.delete(key);
    else next.add(key);
    setPlannedDays(next);
    try {
      if (was) await clearPerDiemDay(key);
      else await setPerDiemDay(key, "home", true);
    } catch {
      setPlannedDays(new Set(plannedDays));
    }
  };

  const cycle = async (key: string) => {
    const prev = manual;
    const next = nextStatus(prev.get(key), key >= FULL_DEFAULT_SINCE);
    const m = new Map(prev);
    if (next) m.set(key, next);
    else m.delete(key);
    setManual(m); // optimistic
    try {
      if (next) await setPerDiemDay(key, next);
      else await clearPerDiemDay(key);
    } catch {
      setManual(new Map(prev)); // revert on failure
    }
  };

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">PER DIEM</h1>
          <span className="font-condensed font-medium text-[16px] text-dim">
            the days out — the meal money the IRS gives back
          </span>
        </div>

        {/* the money first */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="font-condensed font-semibold text-[22.5px] tabular-nums" style={{ color: "var(--color-status-positive-text)" }}>
            {deductibleText} DEDUCTIBLE
          </span>
          <span className="text-[14.5px] text-faint">
            {year === curYear ? "· year to date " : `· ${year} `}·{" "}
            <b className="font-semibold text-ink">{summary?.fullDays ?? "—"}</b> full ·{" "}
            <b className="font-semibold text-ink">{summary?.halfDays ?? "—"}</b> half ·{" "}
            <b className="font-semibold text-ink">{pctWords}%</b>
          </span>
          {summary && summary.inferredCount > 0 && (
            <span className="font-bold text-[12px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-amber-hi border border-amber/40 bg-amber/8">
              ⚠ {summary.inferredCount} DAY{summary.inferredCount === 1 ? "" : "S"} INFERRED
              FROM LOADS — TAP TO CONFIRM
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_2.2fr] gap-4 items-start mt-4">
          {/* THE DEDUCTION */}
          <div
            className="ds2-board relative overflow-hidden"
          >
            <div
              className="flex items-center gap-3 px-4 py-3 border-b ds2-cell-rule"
            >
              <span className="font-condensed font-semibold text-[16px] tracking-[.1em] uppercase">
                THE DEDUCTION
              </span>
              <span className="ml-auto flex items-center gap-2 font-condensed">
                <button
                  onClick={() => setYear((y) => y - 1)}
                  className="text-faint hover:text-ink text-[17.5px]"
                  aria-label="previous year"
                >
                  ‹
                </button>
                <span className="font-condensed font-semibold tabular-nums text-[19.5px] w-12 text-center">
                  {year}
                </span>
                <button
                  onClick={() => setYear((y) => Math.min(curYear, y + 1))}
                  disabled={year >= curYear}
                  className="text-faint hover:text-ink disabled:opacity-30 text-[17.5px]"
                  aria-label="next year"
                >
                  ›
                </button>
              </span>
            </div>
            <div className="p-4">
              <p className="font-condensed font-semibold tabular-nums text-[47.5px] leading-none" style={{ color: "var(--color-status-positive-text)" }}>
                {deductibleText}
              </p>
              <p className="font-condensed text-[12px] tracking-[.14em] uppercase text-faint mt-1">
                deductible per-diem{year === curYear ? " · year to date" : ""}
              </p>
              <div className="flex justify-between font-condensed text-[15px] text-dim mt-3">
                <span>Full days</span>
                <b className="text-ink tabular-nums">{summary?.fullDays ?? "—"}</b>
              </div>
              <div className="flex justify-between font-condensed text-[15px] text-dim mt-1">
                <span>Half days</span>
                <b className="text-ink tabular-nums">{summary?.halfDays ?? "—"}</b>
              </div>
              {ratesFailed && (
                <FetchFailed what="the per-diem rates" onRetry={retryRates} className="mt-3" />
              )}
              {pctFailed && (
                <FetchFailed what="the deductible share" onRetry={retryPct} className="mt-3" />
              )}
              {summary && (
                <div
                  className="mt-3 rounded-[8px] px-3 py-2 font-condensed text-[13px] text-faint tabular-nums"
                  style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)", boxShadow: "var(--shadow-inset)" }}
                >
                  {summary.missingDays.length > 0 && (
                    <div className="mb-1">
                      <MissingInputLine
                        what={"price " + missingDaysWords(summary.missingDays)}
                        missing={[
                          {
                            key: "per_diem_rate",
                            label: "a per-diem rate for those days",
                            fixAt: "SETTINGS",
                            fixTo: "/settings",
                          },
                        ]}
                      />
                    </div>
                  )}
                  {summary.segments.map((seg) => (
                    <div key={seg.rate_id}>{segmentWords(seg)}</div>
                  ))}
                  <div>× {pctWords}% deductible</div>
                </div>
              )}
              <p className="font-condensed text-[12.5px] text-faint mt-2.5">
                {rates == null ? (
                  "loading rates…"
                ) : rates.length === 0 ? (
                  <>
                    no per-diem rate on file ·{" "}
                    <Link to="/settings" className="text-amber-hi hover:text-hot">
                      add one on Settings →
                    </Link>
                  </>
                ) : (
                  <>
                    rates: {ratesWords(rates)} · {pctWords}% deductible ·{" "}
                    <Link to="/settings" className="text-amber-hi hover:text-hot">
                      edit on Settings →
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* THE YEAR */}
          <div className="ds2-board overflow-hidden">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                The year
              </span>
              <span className="font-condensed text-[13px] text-faint">
                {/* The rule differs by era — say the right one for the year on screen. */}
                {year < flipYear
                  ? "· unmarked counts home — tap a day: full → half → home → clear"
                  : year > flipYear
                    ? "· unmarked counts FULL — tap a day: half → home → clear"
                    : "· from Aug 18: unmarked counts FULL (tap: half → home → clear) · before: unmarked counts home (tap: full → half → home)"}
              </span>
            </div>
            <div
              className="grid gap-x-3 gap-y-3 px-4 py-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
            >
            {MONTHS.map((name, mo) => (
              <div key={mo}>
                <div className="text-[12px] uppercase tracking-wide text-muted-text mb-1">
                  {name}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: new Date(year, mo, 1).getDay() }).map(
                    (_, i) => (
                      <div key={`p${i}`} />
                    ),
                  )}
                  {Array.from({ length: new Date(year, mo + 1, 0).getDate() }).map(
                    (_, i) => {
                      const d = i + 1;
                      const key = `${year}-${pad(mo + 1)}-${pad(d)}`;
                      const dt = new Date(year, mo, d);
                      const future = dt > cap;
                      const today = dt.getTime() === now.getTime();
                      const eff = effectiveStatus(key, manual, inferred);
                      const autoFull =
                        !manual.has(key) && key >= FULL_DEFAULT_SINCE && !future;
                      const isInferred =
                        !manual.has(key) && key < FULL_DEFAULT_SINCE && inferred.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => (future ? togglePlanned(key) : cycle(key))}
                          title={
                            future
                              ? `${key} — tap to plan a home day`
                              : autoFull
                                ? `${key} — full day (automatic)`
                                : key
                          }
                          className="rounded-[3px] text-[11px] flex items-center justify-center leading-none"
                          style={{
                            aspectRatio: "1",
                            ...cellStyle(eff, isInferred, autoFull, future, plannedDays.has(key)),
                            boxShadow: today ? "0 0 0 2px var(--color-amber-hi)" : undefined,
                            cursor: "pointer",
                          }}
                        >
                          {d}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
            </div>
            <FortnightCost
              plannedDays={[...plannedDays]}
              obligations={obligations}
              weeklyPayroll={weeklyPayroll}
              contributionPerDayOut={dayWorth}
            />
            <div className="flex gap-x-4 gap-y-1 flex-wrap px-4 pb-2 font-condensed text-[12px] text-faint">
              {year >= flipYear && (
                <Sw style={AUTO_FULL_STYLE} label="Full — automatic (unmarked)" />
              )}
              <Sw style={{ background: "var(--color-amber)" }} label="Full — marked" />
              <Sw
                style={{
                  background: HALF_BG,
                  border: "1px solid var(--color-hairline-lo)",
                }}
                label="Half day"
              />
              <Sw
                style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)" }}
                label={year <= flipYear ? "Home / unmarked (before Aug 18 '26)" : "Home"}
              />
              {year <= flipYear && (
                <Sw
                  style={{ background: "transparent", border: "1.5px dashed var(--color-amber-hi)" }}
                  label="Inferred from a load (before Aug 18 '26) — tap to confirm"
                />
              )}
              <Sw
                style={{ background: "transparent", border: "1px dashed var(--color-hairline-lo)" }}
                label="Future"
              />
            </div>
            <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
              <b className="text-dim">the wiring:</b> from <b className="text-dim">Aug 18, 2026</b>{" "}
              an unmarked day counts as a FULL day out — you only mark home time and
              departure/return halves. Days before that kept the old rules (home unless a
              load covered them or you marked them), so your earlier history and its
              deduction didn't rewrite itself. Home marks here drive the hometime chip on
              the driver page and the truck page's home/idle split — the days-out warning
              reads this calendar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerDiemPage;
