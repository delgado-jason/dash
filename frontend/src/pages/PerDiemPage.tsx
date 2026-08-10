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
} from "@/lib/perDiem";
import type { PerDiemStatus } from "@/types/perDiem";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { money, moneyCents } from "@/lib/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

const AMBER = "var(--color-amber)";
const HALF_BG = `linear-gradient(135deg, ${AMBER} 0 50%, var(--color-well) 50% 100%)`;

const cellStyle = (
  eff: PerDiemStatus,
  inferred: boolean,
  future: boolean,
): CSSProperties => {
  if (future)
    return { background: "transparent", border: "1px dashed var(--color-hairline-lo)", color: "#39445c" };
  // The ghost rule, applied to data: visible, not yet confirmed, tap to claim.
  if (inferred)
    return { background: "transparent", border: "1.5px dashed var(--color-amber-hi)", color: "var(--color-amber-hi)", fontWeight: 600 };
  if (eff === "full") return { background: AMBER, color: "#0d1117", fontWeight: 700 };
  if (eff === "half") return { background: HALF_BG, color: "#0d1117", border: "1px solid var(--color-hairline-lo)" };
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
  const [rate, setRate] = useState(69);
  const [deductPct, setDeductPct] = useState(0.8);

  useEffect(() => {
    getPerDiemDays(year)
      .then((days) => setManual(new Map(days.map((d) => [d.day, d.status]))))
      .catch(() => {});
  }, [year]);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => {
        setRate(s.per_diem_rate);
        setDeductPct(s.per_diem_deduct_pct);
      })
      .catch(() => {});
  }, []);

  // Count/infer only through today (or the year's end for a past year).
  const cap = useMemo(() => {
    const eoy = new Date(year, 11, 31);
    return eoy < now ? eoy : now;
  }, [year, now]);

  const inferred = useMemo(
    () => inferredOutDays(loads ?? [], year, cap),
    [loads, year, cap],
  );
  const summary = useMemo(
    () => computePerDiem(manual, inferred, rate, deductPct),
    [manual, inferred, rate, deductPct],
  );

  const cycle = async (key: string) => {
    const prev = manual;
    const next = nextStatus(prev.get(key));
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
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">PER DIEM</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the days out — the meal money the IRS gives back
          </span>
        </div>

        {/* the money first */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums" style={{ color: "#6fd08c" }}>
            {money(summary.deductible)} DEDUCTIBLE
          </span>
          <span className="text-[13.5px] text-faint">
            {year === curYear ? "· year to date " : `· ${year} `}·{" "}
            <b className="font-semibold text-ink">{summary.fullDays}</b> full ·{" "}
            <b className="font-semibold text-ink">{summary.halfDays}</b> half ·{" "}
            <b className="font-semibold text-ink">{money(rate)}</b>/day ·{" "}
            <b className="font-semibold text-ink">{Math.round(deductPct * 100)}%</b>
          </span>
          {summary.inferredCount > 0 && (
            <span className="font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-amber-hi border border-[rgba(232,148,10,.4)] bg-[rgba(232,148,10,.08)]">
              ⚠ {summary.inferredCount} DAY{summary.inferredCount === 1 ? "" : "S"} INFERRED
              FROM LOADS — TAP TO CONFIRM
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_2.2fr] gap-4 items-start mt-4">
          {/* THE DEDUCTION */}
          <div
            className="relative overflow-hidden rounded-[14px] border"
            style={{
              background: "linear-gradient(180deg, #0e1420, #0b101a)",
              borderColor: "var(--color-hairline)",
              boxShadow: "0 14px 34px rgba(0,0,0,.45)",
            }}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 border-b ds2-cell-rule"
              style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
            >
              <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>
                THE DEDUCTION
              </span>
              <span className="ml-auto flex items-center gap-2 font-condensed">
                <button
                  onClick={() => setYear((y) => y - 1)}
                  className="text-faint hover:text-ink text-[16px]"
                  aria-label="previous year"
                >
                  ‹
                </button>
                <span className="font-display text-[18px] tracking-[.04em] w-12 text-center">
                  {year}
                </span>
                <button
                  onClick={() => setYear((y) => Math.min(curYear, y + 1))}
                  disabled={year >= curYear}
                  className="text-faint hover:text-ink disabled:opacity-30 text-[16px]"
                  aria-label="next year"
                >
                  ›
                </button>
              </span>
            </div>
            <div className="p-4">
              <p className="font-display text-[44px] tracking-[.02em] leading-none" style={{ color: "#6fd08c" }}>
                {money(summary.deductible)}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-1">
                deductible per-diem{year === curYear ? " · year to date" : ""}
              </p>
              <div className="flex justify-between font-condensed text-[14px] text-dim mt-3">
                <span>Full days</span>
                <b className="text-ink tabular-nums">{summary.fullDays}</b>
              </div>
              <div className="flex justify-between font-condensed text-[14px] text-dim mt-1">
                <span>Half days</span>
                <b className="text-ink tabular-nums">{summary.halfDays}</b>
              </div>
              <div
                className="mt-3 rounded-[8px] px-3 py-2 font-condensed text-[12px] text-faint tabular-nums"
                style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
              >
                ({summary.fullDays} × {money(rate)} + {summary.halfDays} ×{" "}
                {moneyCents(rate * 0.75)}) × {Math.round(deductPct * 100)}%
              </div>
              <p className="font-condensed text-[11.5px] text-faint mt-2.5">
                rate <b className="text-ink">{money(rate)}/day</b> ·{" "}
                <b className="text-ink">{Math.round(deductPct * 100)}%</b> deductible ·{" "}
                <Link to="/settings" className="text-amber-hi hover:text-hot">
                  edit on Settings →
                </Link>
              </p>
            </div>
          </div>

          {/* THE YEAR */}
          <div className="ds2-board overflow-hidden">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                The year
              </span>
              <span className="font-condensed text-[12px] text-faint">
                · tap a day: home → full → half
              </span>
            </div>
            <div
              className="grid gap-x-3 gap-y-3 px-4 py-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
            >
            {MONTHS.map((name, mo) => (
              <div key={mo}>
                <div className="text-[11px] uppercase tracking-wide text-muted-text mb-1">
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
                      const isInferred = !manual.has(key) && inferred.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={future}
                          onClick={() => cycle(key)}
                          title={key}
                          className="rounded-[3px] text-[9px] flex items-center justify-center leading-none"
                          style={{
                            aspectRatio: "1",
                            ...cellStyle(eff, isInferred, future),
                            boxShadow: today ? "0 0 0 2px #f5b03a" : undefined,
                            cursor: future ? "default" : "pointer",
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
            <div className="flex gap-x-4 gap-y-1 flex-wrap px-4 pb-2 font-condensed text-[11px] text-faint">
              <Sw style={{ background: "var(--color-amber)" }} label="Full day" />
              <Sw
                style={{
                  background: HALF_BG,
                  border: "1px solid var(--color-hairline-lo)",
                }}
                label="Half day"
              />
              <Sw
                style={{ background: "transparent", border: "1.5px dashed var(--color-amber-hi)" }}
                label="Inferred — tap to confirm"
              />
              <Sw
                style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline)" }}
                label="Home / unmarked"
              />
              <Sw
                style={{ background: "transparent", border: "1px dashed var(--color-hairline-lo)" }}
                label="Future"
              />
            </div>
            <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[11.5px] text-faint">
              <b className="text-dim">the wiring:</b> home marks here drive the hometime chip on
              your driver card — the days-out warning reads this calendar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerDiemPage;
