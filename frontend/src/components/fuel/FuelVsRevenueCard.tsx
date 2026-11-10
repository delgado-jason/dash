import type { FuelVsRevenue, FuelMonth } from "@/lib/metrics/fuelRevenue";
import { money } from "@/lib/format";
import { fscParWords } from "@/lib/metrics/fscTable";

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
  if (exp == null) return "unknown"; // no bar computable — never graded, never green by default
  if (c >= exp) return "par";
  if (c >= exp - 0.05) return "close";
  return "short";
};
const gradeColor = { par: "var(--color-status-positive-text)", close: "var(--color-amber)", short: "var(--color-status-negative-text)", unknown: "var(--color-dim)" } as const;

const CoverageTrend = ({ months, parUnavailable }: { months: FuelMonth[]; parUnavailable: boolean }) => {
  const recent = months.slice(-6).filter((m) => m.fscCoverage != null);
  if (recent.length < 2) return null;
  const max = Math.max(1, ...recent.map((m) => m.fscCoverage ?? 0));
  return (
    <div className="mt-4">
      <p className="text-[12px] text-faint mb-2">
        Surcharge coverage by month — the tick is each month’s par (moves with
        diesel price and your deadhead)
      </p>
      <div className="flex items-end gap-3 h-20">
        {recent.map((m) => {
          const c = m.fscCoverage ?? 0;
          const exp = parUnavailable ? null : m.expectedCoverage;
          const g = coverGrade(m.fscCoverage, exp);
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span
                className="text-[11px] font-condensed"
                style={{ color: gradeColor[g] }}
              >
                {pct0(c)}
              </span>
              <div className="w-full flex items-end relative" style={{ height: 48 }}>
                {exp != null && (
                  <span
                    className="absolute left-0 right-0"
                    style={{
                      bottom: `${Math.min(48, (exp / max) * 48)}px`,
                      height: 2,
                      background: "var(--color-ink)",
                      opacity: 0.5,
                    }}
                    title={`par ~${pct0(exp)}`}
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
              <span className="text-[11px] text-faint">
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
export const FuelVsRevenueCard = ({ data, parUnavailable = false }: { data: FuelVsRevenue; parUnavailable?: boolean }) => {
  const m = data.headline;
  if (!m) return null;
  const sf = data.soFar;

  const expected = parUnavailable ? null : m.expectedCoverage;
  const grade = coverGrade(m.fscCoverage, expected);
  const covered = grade === "par";
  // Dollars short of the month's EXPECTED collection, not of 100% of fuel.
  const gap =
    m.fscCoverage != null && expected != null
      ? m.fsc - expected * m.fuelSpend
      : null;

  return (
    <div className="ds2-board p-4 mt-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-faint uppercase tracking-wider">
            Fuel vs revenue
          </p>
          <p className="text-[12px] text-faint mt-0.5">
            {monthLabel(m.month, { month: "long", year: "numeric" })} · last
            complete month · months with logged fuel only
          </p>
        </div>
        {m.fscCoverage != null &&
          (covered ? (
            <span className="font-condensed font-semibold text-[13px] tracking-[.1em] uppercase text-status-positive-text">SURCHARGE ON PAR</span>
          ) : grade === "close" ? (
            <span className="font-condensed font-semibold text-[13px] tracking-[.1em] uppercase text-amber">SURCHARGE NEAR PAR</span>
          ) : (
            <span className="font-condensed font-semibold text-[13px] tracking-[.1em] uppercase text-status-negative-text">SURCHARGE SHORT</span>
          ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <div className="rounded-md p-3" style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)" }}>
          <p className="text-xs text-faint">Fuel · % of net</p>
          <p className="text-2xl font-condensed mt-1 text-ink">
            {m.fuelPctNet == null ? "—" : pct0(m.fuelPctNet)}
          </p>
          <p className="text-[12px] text-faint mt-0.5">
            {money(m.fuelSpend)}
            {m.net > 0 ? ` of ${money(m.net)} net` : ""}
          </p>
        </div>

        <div
          className="rounded-md p-3"
          style={{
            background: grade === "short" ? "var(--color-status-negative-bg)" : "var(--color-well)",
            border: grade === "short" ? "1px solid color-mix(in srgb, var(--color-status-negative-text) 40%, transparent)" : "1px solid var(--color-hairline)",
          }}
        >
          <p className="text-xs" style={{ color: grade === "short" ? "color-mix(in srgb, var(--color-status-negative-text) 70%, transparent)" : "var(--color-dim)" }}>
            Surcharge covers
          </p>
          <p className="text-2xl font-condensed mt-1" style={{ color: gradeColor[grade] }}>
            {m.fscCoverage == null ? "—" : pct0(m.fscCoverage)}
            {expected != null && (
              <span className="text-[14px] text-faint"> vs ~{pct0(expected)} par</span>
            )}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: grade === "short" ? "color-mix(in srgb, var(--color-status-negative-text) 70%, transparent)" : "var(--color-dim)" }}>
            {money(m.fsc)} FSC vs {money(m.fuelSpend)} fuel
            {gap != null && gap < -1 ? ` · ${money(Math.abs(gap))} under par` : ""}
          </p>
          <p className={"text-[11.5px] mt-1 " + (parUnavailable ? "font-condensed text-amber-hi" : "text-faint")}>
            {parUnavailable
              ? "par unavailable — couldn't load the surcharge tables or the weekly scale"
              : fscParWords(m.par)}
          </p>
        </div>
      </div>

      {sf && (
        <p className="text-[12px] text-faint mt-3">
          {monthLabel(sf.month, { month: "long" })} so far ·{" "}
          {sf.fscCoverage == null ? "—" : pct0(sf.fscCoverage)}
          {!parUnavailable && sf.expectedCoverage != null ? ` vs ~${pct0(sf.expectedCoverage)} par` : ""} ·{" "}
          {money(sf.fsc)} FSC vs {money(sf.fuelSpend)} fuel — a partial month, not graded
          <br />
          {parUnavailable ? "par unavailable — couldn't load the surcharge tables or the weekly scale" : fscParWords(sf.par)}
        </p>
      )}

      <CoverageTrend months={data.months} parUnavailable={parUnavailable} />
    </div>
  );
};
