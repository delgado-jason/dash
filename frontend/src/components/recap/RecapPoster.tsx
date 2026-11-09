import { Truck, MapPin, User } from "lucide-react";
import type { RecapStats } from "@/lib/metrics/recap";
import { RECAP_KICKER } from "@/lib/constants/recapTiers";
import { Panel } from "@/components/ui/Panel";
import { money } from "@/lib/format";
import { Hero, Tile } from "./posterBits";
import { kMoney, num } from "./posterFormat";

const MonthStrip = ({ data }: { data: { label: string; gross: number }[] }) => {
  const max = Math.max(1, ...data.map((d) => d.gross));
  return (
    <div className="rounded-[10px] px-3 py-2.5 bg-canvas">
      <div className="text-[10px] text-muted-text tracking-wide mb-1.5">
        MONTHLY HAUL · {data[0].label} → {data[data.length - 1].label}
      </div>
      <div className="flex gap-1 items-end" style={{ height: 38 }}>
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[2px]"
            style={{ height: `${Math.max(6, (d.gross / max) * 100)}%`, minWidth: 5, background: "var(--color-amber)" }}
            title={`${d.label}: ${kMoney(d.gross)}`}
          />
        ))}
      </div>
    </div>
  );
};

const TopBox = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) => (
  <div className="flex-1 min-w-[130px] rounded-[10px] px-3 py-2.5 bg-well">
    <div className="text-[10px] text-muted-text tracking-wide">
      {icon} {label}
    </div>
    <div className="font-condensed font-semibold text-[16px] text-ink mt-0.5">{value ?? "—"}</div>
  </div>
);

export const RecapPoster = ({
  stats,
  truckAvatarUrl,
}: {
  stats: RecapStats;
  truckAvatarUrl?: string | null;
}) => {
  const rich = stats.scope !== "month"; // quarter + year carry the extra data
  const big = stats.scope === "year";
  const titleSize = stats.scope === "year" ? 40 : stats.scope === "quarter" ? 36 : 30;

  return (
    <Panel className="max-w-[600px] mx-auto overflow-hidden">
      {stats.scope === "year" && (
        <div className="relative h-44 sm:h-52 flex items-center justify-center overflow-hidden bg-canvas border-b border-hairline">
          {truckAvatarUrl ? (
            <img src={truckAvatarUrl} alt="Your truck" className="w-full h-full object-cover" />
          ) : (
            <Truck size={72} className="text-faint" />
          )}
        </div>
      )}

      <div className="relative p-5 sm:p-6">
        <div className="text-center mb-5">
          <div className="ds2-label">DELGADO TRUCKING · {RECAP_KICKER[stats.scope]}</div>
          <div className="font-condensed font-semibold leading-none text-ink mt-1" style={{ fontSize: titleSize }}>
            {stats.label}
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          <Hero value={kMoney(stats.gross)} label="HAULED" big={big} />
          <Hero value={num(stats.totalMiles)} label="MILES" big={big} />
          <Hero value={String(stats.states)} label="STATES" big={big} />
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
            <Tile
              value={money(stats.netProfit)}
              label="NET PROFIT"
              color={stats.netProfit < 0 ? "var(--color-status-negative-text)" : "var(--color-status-positive-text)"}
            />
            {stats.bestMonth && <Tile value={stats.bestMonth.label.split(" ")[0]} label="BEST MONTH" color="var(--color-status-positive-text)" />}
            {stats.hardestMonth && <Tile value={stats.hardestMonth.label.split(" ")[0]} label="HARDEST" color="var(--color-status-negative-text)" />}
          </div>
        )}

        {rich && stats.monthlyGross.length > 1 && (
          <div className="mb-2">
            <MonthStrip data={stats.monthlyGross} />
          </div>
        )}

        {rich && (
          <div className="flex gap-2">
            <TopBox icon={<MapPin size={12} className="inline -mt-0.5 text-dim" />} label="TOP LANE" value={stats.topLane} />
            <TopBox icon={<User size={12} className="inline -mt-0.5 text-dim" />} label="TOP AGENT" value={stats.topAgent} />
          </div>
        )}

        {rich && <div className="text-center mt-4 text-[12px] text-dim">{stats.states} of 48 states</div>}
      </div>
    </Panel>
  );
};
