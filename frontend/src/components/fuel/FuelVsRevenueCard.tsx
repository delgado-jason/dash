import type { FuelVsRevenue, FuelMonth } from "@/lib/metrics/fuelRevenue";
import { money } from "@/lib/format";

const pct0 = (n: number) => `${Math.round(n * 100)}%`;

const monthLabel = (ym: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });

// Coverage colors: green once the surcharge fully pays for the fuel, warming to
// red as the gap that eats linehaul widens.
const coverColor = (c: number | null): string =>
  c == null
    ? "#9daabb"
    : c >= 1
      ? "#4ade80"
      : c >= 0.85
        ? "#e8940a"
        : "#f87171";

const CoverageTrend = ({ months }: { months: FuelMonth[] }) => {
  const recent = months.slice(-6).filter((m) => m.fscCoverage != null);
  if (recent.length < 2) return null;
  const max = Math.max(1, ...recent.map((m) => m.fscCoverage ?? 0));
  return (
    <div className="mt-4">
      <p className="text-[11px] text-faint mb-2">
        Surcharge coverage by month — did FSC pay for the fuel?
      </p>
      <div className="flex items-end gap-3 h-20">
        {recent.map((m) => {
          const c = m.fscCoverage ?? 0;
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span
                className="text-[10px] font-condensed"
                style={{ color: coverColor(m.fscCoverage) }}
              >
                {pct0(c)}
              </span>
              <div className="w-full flex items-end" style={{ height: 48 }}>
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(6, (c / max) * 48)}px`,
                    background: coverColor(m.fscCoverage),
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

  const covered = m.fscCoverage != null && m.fscCoverage >= 1;
  const gap = m.fscCoverage != null ? m.fsc - m.fuelSpend : null;

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
            <span className="font-forge font-bold text-[12px] tracking-[.12em] text-[#6fd08c] border-2 border-[#6fd08c] rounded-[6px] px-[10px] py-[2px] -rotate-3">SURCHARGE COVERS FUEL</span>
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
            background: covered ? "#141a26" : "#2a1618",
            border: covered ? "1px solid #22304a" : "1px solid #7a2f2e",
          }}
        >
          <p
            className="text-xs"
            style={{ color: covered ? "#9daabb" : "#f2a6a3" }}
          >
            Surcharge covers
          </p>
          <p
            className="text-2xl font-condensed mt-1"
            style={{ color: coverColor(m.fscCoverage) }}
          >
            {m.fscCoverage == null ? "—" : pct0(m.fscCoverage)}
          </p>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: covered ? "#9daabb" : "#f2a6a3" }}
          >
            {money(m.fsc)} FSC vs {money(m.fuelSpend)} fuel
            {gap != null && gap < 0 ? ` · ${money(gap)} from linehaul` : ""}
          </p>
        </div>
      </div>

      <CoverageTrend months={data.months} />
    </div>
  );
};
