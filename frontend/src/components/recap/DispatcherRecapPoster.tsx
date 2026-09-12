import { Crown, Leaf, MapPin, Star, Truck } from "lucide-react";
import type { DispatcherRecapStats } from "@/lib/metrics/dispatcherRecap";
import type { SeasonTrophy } from "@/lib/metrics/dispatcherSeason";
import { RECAP_TIERS, stars } from "@/lib/constants/recapTiers";
import { MeterCells } from "@/components/awards/HardwareBoard";
import { Hero, Tile } from "./posterBits";
import { kMoney } from "./posterFormat";

// Detention in hours — "2.5h", whole hours bare ("2h"), "0h" when none.
const fmtHours = (min: number) =>
  min > 0 ? `${(min / 60).toFixed(1).replace(/\.0$/, "")}h` : "0h";

const TrophyTile = ({ t }: { t: SeasonTrophy }) => (
  <div
    className="flex-1 rounded-[9px] px-2 py-2 text-center"
    style={{
      background: "#1c2333",
      border: `1px solid ${t.earned ? "rgba(245,176,58,.5)" : "transparent"}`,
    }}
  >
    <div
      aria-hidden
      className="font-forge font-bold text-[11px] tracking-[1px]"
      style={{ color: t.earned ? "#f5b03a" : "#586b86" }}
    >
      {t.earned ? "WON" : "—"}
    </div>
    <div className="text-[11px] font-semibold mt-0.5" style={{ color: "#f5e6c8" }}>
      {t.name}
    </div>
    <div className="text-[10px] mt-0.5" style={{ color: t.earned ? "#fcd34d" : "#8b97a8" }}>
      {t.detail}
    </div>
    <div className="mt-1.5">
      <MeterCells pct={t.progress} cells={8} />
    </div>
  </div>
);

const TopBox = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) => (
  <div className="flex-1 min-w-[130px] rounded-[10px] px-3 py-2.5" style={{ background: "#1c2333" }}>
    <div className="text-[10px] text-muted-text tracking-wide">
      {icon} {label}
    </div>
    <div className="font-forge font-bold text-[16px] mt-0.5" style={{ color: "#f5b03a" }}>
      {value ?? "—"}
    </div>
  </div>
);

// The dispatcher's recap poster — the owner's frame and tiers, her numbers:
// only the loads SHE booked, all gross. No net, profit, fuel, states, or miles.
export const DispatcherRecapPoster = ({
  stats,
  bestStreak,
  who,
  inProgress,
}: {
  stats: DispatcherRecapStats;
  bestStreak: number; // her personal-grind career best
  who: string; // display name for the "Booked by" tag
  inProgress: boolean; // the period containing today
}) => {
  const t = RECAP_TIERS[stats.scope];
  const big = stats.scope === "year";
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
          <Truck size={72} style={{ color: "#2a3347" }} />
        </div>
      )}

      <div className="relative p-5 sm:p-6">
        <div className="text-center mb-5">
          <div className="font-forge font-bold tracking-[3px] text-[11px] flex items-center justify-center gap-1.5" style={{ color: "#9daabb" }}>
            {t.crown && <Crown size={14} style={{ color: t.metal }} />}
            Booked by {who} · Dispatch ·{" "}
            <span className="font-forge font-bold tracking-[3px]" style={{ color: t.title }}>
              {stars(t.stars)}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2.5 mt-0.5">
            {t.laurels && <Leaf size={titleSize * 0.5} style={{ color: t.metal, transform: "scaleX(-1)" }} />}
            <div className="font-forge font-bold leading-none" style={{ color: t.title, fontSize: titleSize }}>
              {stats.label}
            </div>
            {t.laurels && <Leaf size={titleSize * 0.5} style={{ color: t.metal }} />}
          </div>
          {inProgress && (
            <div
              className="inline-flex items-center mt-2 rounded-full px-3 py-0.5"
              style={{ background: t.chipBg, border: `1px solid ${t.chipBorder}` }}
            >
              <span className="font-forge font-bold tracking-wide text-[11px] uppercase" style={{ color: t.chipInk }}>
                in progress
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-2">
          <Hero value={kMoney(stats.grossBooked)} label="BOOKED GROSS" color="#4ade80" big={big} />
          <Hero value={String(stats.loadsBooked)} label="LOADS" color="#f5b03a" big={big} />
          <Hero value={stats.avgRpm != null ? `$${stats.avgRpm.toFixed(2)}` : "—"} label="AVG $/MI" color="#60a5fa" big={big} />
        </div>

        <div className="flex gap-2 mb-2">
          <Tile value={stats.bestLoad != null ? kMoney(stats.bestLoad) : "—"} label="BEST LOAD" />
          <Tile value={stats.onTimePct != null ? `${Math.round(stats.onTimePct * 100)}%` : "—"} label="ON-TIME" />
          <Tile value={fmtHours(stats.detentionCollectedMin)} label="DETENTION COLLECTED" />
          <Tile value={stats.bestWeekGross != null ? kMoney(stats.bestWeekGross) : "—"} label="BEST WEEK" />
        </div>

        <div className="flex gap-2 mb-2">
          <TopBox
            icon={<Star size={12} className="inline -mt-0.5" style={{ color: "#e8940a" }} />}
            label="TOP AGENT"
            value={stats.topAgent}
          />
          <TopBox
            icon={<MapPin size={12} className="inline -mt-0.5" style={{ color: "#e8940a" }} />}
            label="TOP LANE"
            value={stats.topLane}
          />
        </div>

        <div className="flex gap-2">
          {stats.trophies.map((tr) => (
            <TrophyTile key={tr.key} t={tr} />
          ))}
        </div>

        <div className="text-center mt-4 border-t pt-3" style={{ borderColor: stats.scope === "year" ? "#2a2010" : "#1c2333" }}>
          <span className="font-forge font-bold tracking-[2px] text-[12px]" style={{ color: "#9daabb" }}>
            BEST STREAK {bestStreak} WK · KEEP BOOKING
          </span>
        </div>
      </div>
    </div>
  );
};
