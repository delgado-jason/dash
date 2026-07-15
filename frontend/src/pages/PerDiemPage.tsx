import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { Panel } from "@/components/ui/Panel";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toFixed(2)}`;

const AMBER = "#e8940a";
const HALF_BG = `linear-gradient(135deg, ${AMBER} 0 50%, #2a3347 50% 100%)`;

const cellStyle = (
  eff: PerDiemStatus,
  inferred: boolean,
  future: boolean,
): CSSProperties => {
  if (future) return { background: "#212a3d", color: "#39445c" };
  if (inferred) return { background: "transparent", border: `1.5px solid ${AMBER}`, color: AMBER };
  if (eff === "full") return { background: AMBER, color: "#0d1117", fontWeight: 700 };
  if (eff === "half") return { background: HALF_BG, color: "#0d1117" };
  return { background: "#2a3347", color: "#6b7793" }; // home / unmarked
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
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed mb-1">Per diem</h1>
      <p className="text-sm text-muted-text mb-6">
        Days out for the meal-allowance (M&amp;IE) deduction. Tap a day: home →
        full → half.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_2.4fr] gap-4 items-start">
        {/* SUMMARY */}
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-text uppercase tracking-wider">
              Tax year
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="text-muted-text hover:text-light"
                aria-label="previous year"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-condensed text-lg w-12 text-center">{year}</span>
              <button
                onClick={() => setYear((y) => Math.min(curYear, y + 1))}
                disabled={year >= curYear}
                className="text-muted-text hover:text-light disabled:opacity-30"
                aria-label="next year"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <p className="text-4xl font-condensed mt-2" style={{ color: "#4ade80" }}>
            {money(summary.deductible)}
          </p>
          <p className="text-[11px] text-muted-text">
            deductible per-diem{year === curYear ? " · year to date" : ""}
          </p>

          <div className="mt-3 text-sm flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-muted-text">Full days</span>
              <span className="font-condensed">{summary.fullDays}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-text">Half days</span>
              <span className="font-condensed">{summary.halfDays}</span>
            </div>
          </div>

          <div
            className="mt-3 rounded-md px-3 py-2 text-[11px] text-muted-text"
            style={{ background: "#0d1119", border: "1px solid #22304a" }}
          >
            ({summary.fullDays} × {money(rate)} + {summary.halfDays} ×{" "}
            {money2(rate * 0.75)}) × {Math.round(deductPct * 100)}%
          </div>

          <p className="text-[11px] text-muted-text mt-2">
            rate <span className="text-light">{money(rate)}/day</span> ·{" "}
            <span className="text-light">{Math.round(deductPct * 100)}%</span>{" "}
            deductible ·{" "}
            <Link to="/settings" className="text-amber-light hover:underline">
              edit
            </Link>
          </p>

          {summary.inferredCount > 0 && (
            <p
              className="mt-2 rounded-md px-2 py-1.5 text-[11px]"
              style={{ background: "#241a0e", border: "1px solid #7a4718", color: "#f5c37a" }}
            >
              ⚠ {summary.inferredCount} day{summary.inferredCount === 1 ? "" : "s"}{" "}
              inferred from your loads — tap to confirm
            </p>
          )}
        </Panel>

        {/* CALENDAR */}
        <Panel className="p-4">
          <div
            className="grid gap-x-3 gap-y-2"
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

          <div className="flex gap-x-4 gap-y-1 flex-wrap mt-3 text-[11px] text-muted-text">
            <Sw style={{ background: AMBER }} label="Full day" />
            <Sw style={{ background: HALF_BG }} label="Half day" />
            <Sw
              style={{ background: "transparent", border: `1.5px solid ${AMBER}` }}
              label="Inferred (tap to confirm)"
            />
            <Sw style={{ background: "#2a3347" }} label="Home" />
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default PerDiemPage;
