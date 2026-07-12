import { Truck, MapPin, Star } from "lucide-react";
import type { RecapStats } from "@/lib/metrics/recap";

const kMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

const Tile = ({
  value,
  label,
  color = "#f5e6c8",
}: {
  value: string;
  label: string;
  color?: string;
}) => (
  <div className="rounded-[10px] px-3 py-2.5 text-center" style={{ background: "#1c2333" }}>
    <div className="font-comic text-[22px] leading-none" style={{ color }}>
      {value}
    </div>
    <div className="text-[10px] text-muted-text mt-1 tracking-wide">{label}</div>
  </div>
);

const Hero = ({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) => (
  <div className="flex-1 rounded-xl px-2 py-3 text-center" style={{ background: "#0a0d13" }}>
    <div className="font-comic text-3xl leading-none" style={{ color }}>
      {value}
    </div>
    <div className="text-[11px] text-muted-text mt-1 tracking-wider">{label}</div>
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
  const isYear = stats.scope === "year";
  const edge = isYear ? "#f5b03a" : "#e8940a";
  const kicker = isYear ? "GRAND FINALE · THE" : "RECAP ·";
  const title = isYear ? `${stats.label} SEASON` : stats.label;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 max-w-[600px] mx-auto"
      style={{ background: "#10151f", borderColor: edge }}
    >
      <div
        className="absolute top-0 right-0 w-40 h-40 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
          backgroundSize: "8px 8px",
          opacity: 0.13,
        }}
      />

      {isYear && (
        <div
          className="relative h-44 sm:h-52 border-b-2 flex items-center justify-center overflow-hidden"
          style={{ borderColor: edge, background: "#0a0d13" }}
        >
          {truckAvatarUrl ? (
            <img
              src={truckAvatarUrl}
              alt="Your truck"
              className="w-full h-full object-cover"
            />
          ) : (
            <Truck size={72} style={{ color: "#2a3347" }} />
          )}
        </div>
      )}

      <div className="relative p-5 sm:p-6">
        <div className="text-center mb-5">
          <div className="font-comic tracking-[4px] text-xs" style={{ color: "#9daabb" }}>
            DELGADO TRUCKING · {kicker}
          </div>
          <div className="font-comic leading-none" style={{ color: edge, fontSize: isYear ? 44 : 34 }}>
            {title}
          </div>
          <div
            className="inline-flex items-center gap-1.5 mt-2.5 rounded-full px-3 py-0.5"
            style={{ background: "#3a2a0a", border: "1px solid #e8940a" }}
          >
            <Truck size={14} style={{ color: "#f5b03a" }} />
            <span className="font-comic tracking-wide text-[14px] uppercase" style={{ color: "#f5e6c8" }}>
              {rank}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mb-2.5">
          <Hero value={kMoney(stats.gross)} label="HAULED" color="#4ade80" />
          <Hero value={num(stats.totalMiles)} label="MILES" color="#f5b03a" />
          <Hero value={String(stats.states)} label="STATES" color="#60a5fa" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Tile value={String(stats.loads)} label="LOADS" />
          <Tile value={stats.bestWeek != null ? kMoney(stats.bestWeek) : "—"} label="BEST WEEK" />
          <Tile value={stats.biggestLoad != null ? kMoney(stats.biggestLoad) : "—"} label="BIGGEST LOAD" />
          <Tile value={stats.longestHaul != null ? num(stats.longestHaul) : "—"} label="LONGEST HAUL (MI)" />
          <Tile value={stats.bestMpg != null ? stats.bestMpg.toFixed(1) : "—"} label="BEST TANK (MPG)" />
          <Tile value={stats.avgRpm != null ? `$${stats.avgRpm.toFixed(2)}` : "—"} label="AVG RPM" />
        </div>

        {stats.netProfit != null && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Tile value={money0(stats.netProfit)} label="NET PROFIT" color="#4ade80" />
            {stats.bestMonth && <Tile value={stats.bestMonth.label.split(" ")[0]} label="BEST MONTH" color="#4ade80" />}
            {stats.hardestMonth && <Tile value={stats.hardestMonth.label.split(" ")[0]} label="HARDEST MONTH" color="#f87171" />}
          </div>
        )}

        <div className="flex gap-2 flex-wrap mt-2.5">
          <div className="flex-1 min-w-[180px] rounded-[10px] px-3 py-2.5" style={{ background: "#1c2333" }}>
            <div className="text-[10px] text-muted-text tracking-wide">
              <MapPin size={12} className="inline -mt-0.5" style={{ color: "#e8940a" }} /> TOP LANE
            </div>
            <div className="font-comic text-[17px] mt-0.5" style={{ color: "#f5b03a" }}>
              {stats.topLane ?? "—"}
            </div>
          </div>
          <div className="flex-1 min-w-[150px] rounded-[10px] px-3 py-2.5" style={{ background: "#1c2333" }}>
            <div className="text-[10px] text-muted-text tracking-wide">
              <Star size={12} className="inline -mt-0.5" style={{ color: "#e8940a" }} /> TOP AGENT
            </div>
            <div className="font-comic text-[17px] mt-0.5" style={{ color: "#f5b03a" }}>
              {stats.topAgent ?? "—"}
            </div>
          </div>
        </div>

        <div className="text-center mt-4 border-t border-plate pt-3">
          <span className="font-comic tracking-[2px] text-[13px]" style={{ color: "#9daabb" }}>
            {stats.states} OF 48 STATES · BEST STREAK {stats.bestStreak} WK · KEEP ROLLING
          </span>
        </div>
      </div>
    </div>
  );
};
