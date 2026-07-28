import { Truck, MapPin, Star, Crown, Leaf } from "lucide-react";
import type { RecapStats } from "@/lib/metrics/recap";
import { RECAP_TIERS } from "@/lib/constants/recapTiers";
import { money } from "@/lib/format";

const kMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

const Pips = ({ n, color }: { n: number; color: string }) => (
  <span className="font-comic tracking-[3px]" style={{ color }}>
    {"★ ".repeat(n).trim()}
  </span>
);

const Tile = ({
  value,
  label,
  color = "#f5e6c8",
}: {
  value: string;
  label: string;
  color?: string;
}) => (
  <div className="flex-1 rounded-[9px] px-1 py-2 text-center" style={{ background: "#1c2333" }}>
    <div className="font-comic text-[19px] leading-none" style={{ color }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
  </div>
);

const Hero = ({
  value,
  label,
  color,
  big,
}: {
  value: string;
  label: string;
  color: string;
  big: boolean;
}) => (
  <div className="flex-1 rounded-xl text-center" style={{ background: "#0a0d13", padding: big ? "11px 4px" : "9px 4px" }}>
    <div className="font-comic leading-none" style={{ color, fontSize: big ? 30 : 26 }}>
      {value}
    </div>
    <div className="text-[10px] text-muted-text mt-1 tracking-wider">{label}</div>
  </div>
);

const MonthStrip = ({
  data,
  color,
}: {
  data: { label: string; gross: number }[];
  color: string;
}) => {
  const max = Math.max(1, ...data.map((d) => d.gross));
  return (
    <div className="rounded-[10px] px-3 py-2.5" style={{ background: "#0a0d13" }}>
      <div className="text-[10px] text-muted-text tracking-wide mb-1.5">
        MONTHLY HAUL · {data[0].label} → {data[data.length - 1].label}
      </div>
      <div className="flex gap-1 items-end" style={{ height: 38 }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{ height: `${Math.max(6, (d.gross / max) * 100)}%`, minWidth: 5, background: color }}
            title={`${d.label}: ${kMoney(d.gross)}`}
          />
        ))}
      </div>
    </div>
  );
};

const RankChip = ({ rank, t }: { rank: string; t: (typeof RECAP_TIERS)[keyof typeof RECAP_TIERS] }) => (
  <div
    className="inline-flex items-center gap-1.5 mt-2 rounded-full px-3 py-0.5"
    style={{ background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
  >
    <Truck size={13} style={{ color: t.chipInk }} />
    <span className="font-comic tracking-wide text-[13px] uppercase" style={{ color: t.chipInk }}>
      {rank}
    </span>
  </div>
);

export const RecapPoster = ({
  stats,
  rank,
  truckAvatarUrl,
}: {
  stats: RecapStats;
  rank: string;
  truckAvatarUrl?: string | null;
}) => {
  const t = RECAP_TIERS[stats.scope];
  const rich = stats.scope !== "month"; // quarter + year carry the extra data
  const titleSize = stats.scope === "year" ? 44 : stats.scope === "quarter" ? 38 : 30;

  return (
    <div
      className="relative overflow-hidden rounded-2xl max-w-[600px] mx-auto"
      style={{
        background: t.cardBg,
        border: `${t.border}px solid ${t.metal}`,
        boxShadow: t.inner ? `inset 0 0 0 ${stats.scope === "year" ? 2 : 1}px ${t.inner}` : undefined,
      }}
    >
      <div
        className="absolute top-0 right-0 w-40 h-40 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${t.metal} 1.3px, transparent 1.4px)`,
          backgroundSize: "8px 8px",
          opacity: 0.14,
        }}
      />

      {t.banner && (
        <div
          className="relative h-44 sm:h-52 flex items-center justify-center overflow-hidden"
          style={{ borderBottom: `${t.border}px solid ${t.metal}`, background: "#0a0d13" }}
        >
          {truckAvatarUrl ? (
            <img src={truckAvatarUrl} alt="Your truck" className="w-full h-full object-cover" />
          ) : (
            <Truck size={72} style={{ color: "#2a3347" }} />
          )}
        </div>
      )}

      <div className="relative p-5 sm:p-6">
        <div className="text-center mb-5">
          <div className="font-comic tracking-[3px] text-[11px] flex items-center justify-center gap-1.5" style={{ color: "#9daabb" }}>
            {t.crown && <Crown size={14} style={{ color: t.metal }} />}
            DELGADO TRUCKING · {t.kicker} · <Pips n={t.stars} color={t.title} />
          </div>
          <div className="flex items-center justify-center gap-2.5 mt-0.5">
            {t.laurels && <Leaf size={titleSize * 0.5} style={{ color: t.metal, transform: "scaleX(-1)" }} />}
            <div className="font-comic leading-none" style={{ color: t.title, fontSize: titleSize }}>
              {stats.label}
            </div>
            {t.laurels && <Leaf size={titleSize * 0.5} style={{ color: t.metal }} />}
          </div>
          <RankChip rank={rank} t={t} />
        </div>

        <div className="flex gap-2 mb-2">
          <Hero value={kMoney(stats.gross)} label="HAULED" color="#4ade80" big={stats.scope === "year"} />
          <Hero value={num(stats.totalMiles)} label="MILES" color={t.metal === "#b3763f" ? "#f5b03a" : t.metal} big={stats.scope === "year"} />
          <Hero value={String(stats.states)} label="STATES" color="#60a5fa" big={stats.scope === "year"} />
        </div>

        <div className="flex gap-2 mb-2">
          <Tile value={String(stats.loads)} label="LOADS" />
          <Tile value={stats.bestWeek != null ? kMoney(stats.bestWeek) : "—"} label="BEST WEEK" />
          {rich && <Tile value={stats.biggestLoad != null ? kMoney(stats.biggestLoad) : "—"} label="BIGGEST" />}
          {rich && <Tile value={stats.longestHaul != null ? num(stats.longestHaul) : "—"} label="LONGEST MI" />}
          <Tile value={stats.bestMpg != null ? stats.bestMpg.toFixed(1) : "—"} label="BEST TANK" />
          {rich && <Tile value={stats.avgRpm != null ? `$${stats.avgRpm.toFixed(2)}` : "—"} label="AVG RPM" />}
        </div>

        {rich && stats.netProfit != null && (
          <div className="flex gap-2 mb-2">
            <Tile value={money(stats.netProfit)} label="NET PROFIT" color="#4ade80" />
            {stats.bestMonth && <Tile value={stats.bestMonth.label.split(" ")[0]} label="BEST MONTH" color="#4ade80" />}
            {stats.hardestMonth && <Tile value={stats.hardestMonth.label.split(" ")[0]} label="HARDEST" color="#f87171" />}
          </div>
        )}

        {rich && stats.monthlyGross.length > 1 && (
          <div className="mb-2">
            <MonthStrip data={stats.monthlyGross} color={t.metal} />
          </div>
        )}

        {rich && (
          <div className="flex gap-2">
            <div className="flex-1 min-w-[150px] rounded-[10px] px-3 py-2.5" style={{ background: "#1c2333" }}>
              <div className="text-[10px] text-muted-text tracking-wide">
                <MapPin size={12} className="inline -mt-0.5" style={{ color: "#e8940a" }} /> TOP LANE
              </div>
              <div className="font-comic text-[16px] mt-0.5" style={{ color: "#f5b03a" }}>
                {stats.topLane ?? "—"}
              </div>
            </div>
            <div className="flex-1 min-w-[130px] rounded-[10px] px-3 py-2.5" style={{ background: "#1c2333" }}>
              <div className="text-[10px] text-muted-text tracking-wide">
                <Star size={12} className="inline -mt-0.5" style={{ color: "#e8940a" }} /> TOP AGENT
              </div>
              <div className="font-comic text-[16px] mt-0.5" style={{ color: "#f5b03a" }}>
                {stats.topAgent ?? "—"}
              </div>
            </div>
          </div>
        )}

        <div className="text-center mt-4 border-t pt-3" style={{ borderColor: stats.scope === "year" ? "#2a2010" : "#1c2333" }}>
          <span className="font-comic tracking-[2px] text-[12px]" style={{ color: "#9daabb" }}>
            {rich ? `${stats.states} OF 48 STATES · ` : ""}BEST STREAK {stats.bestStreak} WK · KEEP ROLLING
          </span>
        </div>
      </div>
    </div>
  );
};
