import { MapPin, Truck, User } from "lucide-react";
import type { DispatcherRecapStats } from "@/lib/metrics/dispatcherRecap";
import { RECAP_KICKER } from "@/lib/constants/recapTiers";
import { Panel } from "@/components/ui/Panel";
import { Hero, Tile } from "./posterBits";
import { kMoney } from "./posterFormat";

// Detention in hours — "2.5h", whole hours bare ("2h"), "0h" when none.
const fmtHours = (min: number) =>
  min > 0 ? `${(min / 60).toFixed(1).replace(/\.0$/, "")}h` : "0h";

const TopBox = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) => (
  <div className="flex-1 min-w-[130px] rounded-[10px] px-3 py-2.5 bg-well">
    <div className="text-[11px] text-muted-text tracking-wide">
      {icon} {label}
    </div>
    <div className="font-condensed font-semibold text-[17.5px] text-ink mt-0.5">{value ?? "—"}</div>
  </div>
);

// The dispatcher's recap — the owner's plain frame, her numbers: only the
// loads SHE booked, all gross. No net, profit, fuel, states, or miles.
export const DispatcherRecapPoster = ({
  stats,
  who,
  inProgress,
}: {
  stats: DispatcherRecapStats;
  who: string; // display name for the "Booked by" tag
  inProgress: boolean; // the period containing today
}) => {
  const big = stats.scope === "year";
  const titleSize = stats.scope === "year" ? 40 : stats.scope === "quarter" ? 36 : 30;

  return (
    <Panel className="max-w-[600px] mx-auto overflow-hidden">
      {stats.scope === "year" && (
        <div className="relative h-44 sm:h-52 flex items-center justify-center overflow-hidden bg-canvas border-b border-hairline">
          <Truck size={72} className="text-faint" />
        </div>
      )}

      <div className="relative p-5 sm:p-6">
        <div className="text-center mb-5">
          <div className="ds2-label">
            Booked by {who} · Dispatch · {RECAP_KICKER[stats.scope]}
          </div>
          <div className="font-condensed font-semibold leading-none text-ink mt-1" style={{ fontSize: titleSize }}>
            {stats.label}
          </div>
          {inProgress && <div className="ds2-label mt-2">in progress</div>}
        </div>

        <div className="flex gap-2 mb-2">
          <Hero value={kMoney(stats.grossBooked)} label="BOOKED GROSS" big={big} />
          <Hero value={String(stats.loadsBooked)} label="LOADS" big={big} />
          <Hero value={stats.avgRpm != null ? `$${stats.avgRpm.toFixed(2)}` : "—"} label="AVG $/MI" big={big} />
        </div>

        <div className="flex gap-2 mb-2">
          <Tile value={stats.bestLoad != null ? kMoney(stats.bestLoad) : "—"} label="BEST LOAD" />
          <Tile value={stats.onTimePct != null ? `${Math.round(stats.onTimePct * 100)}%` : "—"} label="ON-TIME" />
          <Tile value={fmtHours(stats.detentionCollectedMin)} label="DETENTION COLLECTED" />
          <Tile value={stats.bestWeekGross != null ? kMoney(stats.bestWeekGross) : "—"} label="BEST WEEK" />
        </div>

        <div className="flex gap-2">
          <TopBox icon={<User size={12} className="inline -mt-0.5 text-dim" />} label="TOP AGENT" value={stats.topAgent} />
          <TopBox icon={<MapPin size={12} className="inline -mt-0.5 text-dim" />} label="TOP LANE" value={stats.topLane} />
        </div>
      </div>
    </Panel>
  );
};
