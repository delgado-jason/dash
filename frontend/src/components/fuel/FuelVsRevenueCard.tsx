import type { FuelVsRevenue, FuelMonth } from "@/lib/metrics/fuelRevenue";
import { money } from "@/lib/format";

const pct0 = (n: number) => `${Math.round(n * 100)}%`;

const monthLabel = (ym: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });

// Coverage grades against the month's EXPECTED coverage — the FSC standard
// ((price − peg)/price × loaded share × MPG bonus) — never against 100%: a
// surcharge only pays the price above the peg on loaded miles, so demanding
// 100% shows red forever. On par (≥ expected) is green; within 5 pts is
// amber; further short is red (FSC leaking — loads booked light on surcharge
// or deadhead eating the collected miles).
const coverGrade = (c: number | null, exp: number | null): "par" | "close" | "short" | "unknown" => {
  if (c == null) return "unknown";
  if (exp == null) return c >= 1 ? "par" : "unknown"; // no bar computable — only 100% is safely green
  if (c >= exp) return "par";
  if (c >= exp - 0.05) return "close";
  return "short";
};
const gradeColor = { par: "#4ade80", close: "#e8940a", short: "#f87171", unknown: "#9daabb" } as const;

const CoverageTrend = ({ months }: { months: FuelMonth[] }) => {
  const recent = months.slice(-6).filter((m) => m.fscCoverage != null);
  if (recent.length < 2) return null;
  const max = Math.max(1, ...recent.map((m) => m.fscCoverage ?? 0));
  return (
    <div className="mt-4">
      <p className="text-[11px] text-faint mb-2">
        Surcharge coverage by month — the tick is each month’s par (moves with
        diesel price and your deadhead)
      </p>
      <div className="flex items-end gap-3 h-20">
        {recent.map((m) => {
          const c = m.fscCoverage ?? 0;
          const g = coverGrade(m.fscCoverage, m.expectedCoverage);
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span
                className="text-[10px] font-condensed"
                style={{ color: gradeColor[g] }}
              >
                {pct0(c)}
              </span>
              <div className="w-full flex items-end relative" style={{ height: 48 }}>
                {m.expectedCoverage != null && (
                  <span
                    className="absolute left-0 right-0"
                    style={{
                      bottom: `${Math.min(48, (m.expectedCoverage / max) * 48)}px`,
                      height: 2,
                      background: "#e8edf6",
                      opacity: 0.5,
                    }}
                    title={`par ~${pct0(m.expectedCoverage)}`}
                  />
                )}
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(6, (c / max) * 48)}px`,
                    background: gradeColor[g],
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="text-[10px] text-faint">
                {monthLabel(m.month, { month: "short" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Fuel put next to the money it relates to: what share of gross it eats, and
// whether the fuel surcharge is still covering it. Only months with logged fuel
// are counted, so an un-logged month never shows a false 0%.
export const FuelVsRevenueCard = ({ data }: { data: FuelVsRevenue }) => {
  const m = data.latest;
  if (!m) return null;

  const grade = coverGrade(m.fscCoverage, m.expectedCoverage);
  const covered = grade === "par";
  // Dollars short of the month's EXPECTED collection, not of 100% of fuel.
  const gap =
    m.fscCoverage != null && m.expectedCoverage != null
      ? m.fsc - m.expectedCoverage * m.fuelSpend
      : null;

  return (
    <div className="ds2-board p-4 mt-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-faint uppercase tracking-wider">
            Fuel vs revenue
          </p>
          <p className="text-[11px] text-faint mt-0.5">
            {monthLabel(m.month, { month: "long", year: "numeric" })} · months
            with logged fuel only
          </p>
        </div>
        {m.fscCoverage != null &&
          (covered ? (
            <span className="font-forge font-bold text-[12px] tracking-[.12em] text-[#6fd08c] border-2 border-[#6fd08c] rounded-[6px] px-[10px] py-[2px] -rotate-3">SURCHARGE ON PAR</span>
          ) : grade === "close" ? (
            <span className="font-forge font-bold text-[12px] tracking-[.12em] text-[#e8940a] border-2 border-[#e8940a] rounded-[6px] px-[10px] py-[2px] -rotate-3">SURCHARGE NEAR PAR</span>
          ) : (
            <span className="font-forge font-bold text-[12px] tracking-[.12em] text-[#e05252] border-2 border-[#e05252] rounded-[6px] px-[10px] py-[2px] -rotate-3">SURCHARGE SHORT</span>
          ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <div className="rounded-md p-3" style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)" }}>
          <p className="text-xs text-faint">Fuel · % of net</p>
          <p className="text-2xl font-condensed mt-1 text-ink">
            {m.fuelPctNet == null ? "—" : pct0(m.fuelPctNet)}
          </p>
          <p className="text-[11px] text-faint mt-0.5">
            {money(m.fuelSpend)}
            {m.net > 0 ? ` of ${money(m.net)} net` : ""}
          </p>
        </div>

        <div
          className="rounded-md p-3"
          style={{
            background: grade === "short" ? "#2a1618" : "#141a26",
            border: grade === "short" ? "1px solid #7a2f2e" : "1px solid #22304a",
          }}
        >
          <p className="text-xs" style={{ color: grade === "short" ? "#f2a6a3" : "#9daabb" }}>
            Surcharge covers
          </p>
          <p className="text-2xl font-condensed mt-1" style={{ color: gradeColor[grade] }}>
            {m.fscCoverage == null ? "—" : pct0(m.fscCoverage)}
            {m.expectedCoverage != null && (
              <span className="text-[13px] text-faint"> vs ~{pct0(m.expectedCoverage)} par</span>
            )}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: grade === "short" ? "#f2a6a3" : "#9daabb" }}>
            {money(m.fsc)} FSC vs {money(m.fuelSpend)} fuel
            {gap != null && gap < -1 ? ` · ${money(Math.abs(gap))} under par` : ""}
          </p>
          <p className="text-[10.5px] text-faint mt-1">
            par = price above the ~$1.25/gal peg, loaded miles only — full
            coverage was never the game
          </p>
        </div>
      </div>

      <CoverageTrend months={data.months} />
    </div>
  );
};
