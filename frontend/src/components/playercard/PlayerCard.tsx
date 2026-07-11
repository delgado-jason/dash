import type { ReactNode } from "react";
import {
  Truck,
  Trophy,
  Flame,
  Package,
  Layers,
  Users,
  Medal,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type {
  Grade,
  CareerRank,
  SeasonStats,
  PersonalBests,
  Trophy as TrophyData,
} from "@/lib/metrics/playerCard";
import { fmtMiles } from "@/lib/metrics/mileClub";
import { RANK_TIERS } from "@/lib/constants/playerCard";
import { MiniTrophyCard } from "@/components/comic/MiniTrophyCard";

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

const GRADE_META: Record<Grade, { label: string; fg: string; bg: string }> = {
  below: { label: "BELOW", fg: "#f87171", bg: "#3a1a1a" },
  minimum: { label: "MINIMUM", fg: "#e8940a", bg: "#3a2a0a" },
  target: { label: "TARGET", fg: "#4ade80", bg: "#1a3a2a" },
  strong: { label: "STRONG", fg: "#fbbf24", bg: "#3a300a" },
};

const TROPHY_ICON: Record<string, LucideIcon> = {
  medal: Medal,
  users: Users,
  stack: Layers,
  trophy: Trophy,
  flame: Flame,
};

const GradeChip = ({ grade, value }: { grade: Grade | null; value?: string }) => {
  if (!grade)
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-plate text-muted-text">—</span>;
  const m = GRADE_META[grade];
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
      {value ? ` · ${value}` : ""}
    </span>
  );
};

const Stat = ({
  label,
  value,
  color,
  span2,
}: {
  label: string;
  value: string;
  color?: string;
  span2?: boolean;
}) => (
  <div className={`bg-plate rounded-lg px-3 py-2 ${span2 ? "col-span-2" : ""}`}>
    <p className="text-[11px] text-muted-text">{label}</p>
    <p className="text-lg font-condensed truncate" style={color ? { color } : undefined}>
      {value}
    </p>
  </div>
);

const Record = ({
  Icon,
  label,
  value,
  color,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}) => (
  <div className="rounded-[11px] border border-plate px-3 py-2.5" style={{ background: "#10151f" }}>
    <p className="text-[11px] text-muted-text flex items-center gap-1.5">
      <Icon size={13} style={{ color }} />
      {label}
    </p>
    <p className="text-lg font-condensed mt-0.5">{value}</p>
  </div>
);

export interface PlayerCardProps {
  name: string;
  business: string;
  avatar: ReactNode;
  rank: CareerRank;
  season: SeasonStats;
  rpmGrade: Grade | null;
  marginGrade: Grade | null;
  form: Grade | null;
  windowRpm: number | null;
  bests: PersonalBests;
  trophies: TrophyData[];
}

export const PlayerCard = ({
  name,
  business,
  avatar,
  rank,
  season,
  rpmGrade,
  marginGrade,
  form,
  windowRpm,
  bests,
  trophies,
}: PlayerCardProps) => {
  const stars =
    "★".repeat(rank.index + 1) + "☆".repeat(RANK_TIERS.length - rank.index - 1);

  return (
    <div>
      {/* ---- card header ---- */}
      <div
        className="relative overflow-hidden rounded-2xl border-2 p-4"
        style={{ background: "#10151f", borderColor: "#e8940a" }}
      >
        <div
          className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
            backgroundSize: "7px 7px",
            opacity: 0.14,
          }}
        />
        <div className="flex gap-4 items-start relative">
          <div className="shrink-0">{avatar}</div>
          <div className="flex-1 min-w-0">
            <h1 className="font-condensed text-3xl leading-none">{name}</h1>
            <p className="text-xs text-muted-text mb-3">{business}</p>
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#3a2a0a", border: "2px solid #e8940a", color: "#f5b03a" }}
              >
                <Truck size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="font-comic text-xl leading-none"
                  style={{ color: "#f5e6c8", letterSpacing: "1px" }}
                >
                  {rank.name}
                </div>
                <div className="text-[10px] text-muted-text mt-0.5">
                  <span style={{ color: "#f5b03a", letterSpacing: "1px" }}>{stars}</span> · Career rank
                </div>
                <div className="h-1.5 rounded bg-plate mt-1 overflow-hidden">
                  <div className="h-full" style={{ width: `${rank.pct * 100}%`, background: "#e8940a" }} />
                </div>
                {rank.next && (
                  <div className="text-[9.5px] text-muted-text mt-0.5">
                    {fmtMiles(rank.toNext)} to {rank.next.name}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* season form strip */}
        <div
          className="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t relative"
          style={{ borderColor: "#2a3347" }}
        >
          <span className="font-condensed text-sm tracking-wide text-muted-text">
            SEASON · {season.label}
          </span>
          <span className="text-[11px] text-muted-text">Rate</span>
          <GradeChip grade={rpmGrade} value={windowRpm != null ? `$${windowRpm.toFixed(2)}` : undefined} />
          <span className="text-[11px] text-muted-text">Margin</span>
          <GradeChip grade={marginGrade} value={season.netMargin != null ? pct1(season.netMargin) : undefined} />
          <span className="flex-1" />
          <span className="text-[11px] text-muted-text">Form</span>
          {form ? (
            <span
              className="font-comic px-2.5 py-0.5 rounded-full"
              style={{ background: GRADE_META[form].bg, color: GRADE_META[form].fg, letterSpacing: "2px", fontSize: 14 }}
            >
              {GRADE_META[form].label}
            </span>
          ) : (
            <span className="text-[11px] text-muted-text">— needs a full month</span>
          )}
        </div>
      </div>

      {/* ---- season stat line ---- */}
      <div className="flex items-baseline gap-2 mt-5 mb-2">
        <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
          THIS SEASON
        </span>
        <span className="text-[11px] text-muted-text">
          · {season.label} · your last 3 complete months
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Net revenue" value={money0(season.netRevenue)} />
        <Stat label="Net profit" value={money0(season.netProfit)} color="#4ade80" />
        <Stat label="Net margin" value={season.netMargin != null ? pct1(season.netMargin) : "—"} />
        <Stat label="Loads" value={String(season.loads)} />
        <Stat label="Miles" value={Math.round(season.totalMiles).toLocaleString("en-US")} />
        <Stat label="Deadhead" value={season.deadheadPct != null ? pct1(season.deadheadPct) : "—"} />
        <Stat label="Avg RPM" value={season.avgRpm != null ? `$${season.avgRpm.toFixed(2)}` : "—"} />
        <Stat label="Best lane" value={season.bestLane?.lane ?? "—"} span2 />
      </div>

      {/* ---- personal bests ---- */}
      <div className="flex items-baseline gap-2 mt-6">
        <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
          PERSONAL BESTS
        </span>
        <span className="text-[11px] text-muted-text">— top one and it re-earns</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
        <Record Icon={Trophy} label="Top week" color="#f5b03a" value={bests.bestWeekRevenue != null ? money0(bests.bestWeekRevenue) : "—"} />
        <Record Icon={TrendingDown} label="Best deadhead" color="#4ade80" value={bests.lowestDeadheadPct != null ? pct1(bests.lowestDeadheadPct) : "—"} />
        <Record Icon={Flame} label="Best tank" color="#e8940a" value={bests.bestMpg != null ? `${bests.bestMpg.toFixed(1)} mpg` : "—"} />
        <Record Icon={Package} label="Biggest load" color="#f5b03a" value={bests.biggestLoad != null ? money0(bests.biggestLoad) : "—"} />
        <Record Icon={Layers} label="Most loads / wk" color="#60a5fa" value={bests.mostLoadsInWeek != null ? String(bests.mostLoadsInWeek) : "—"} />
      </div>

      {/* ---- trophy shelf ---- */}
      {trophies.length > 0 && (
        <>
          <div className="font-comic text-lg mt-6" style={{ color: "#f5b03a" }}>
            TROPHY SHELF
          </div>
          <div className="flex flex-wrap gap-2.5 mt-2">
            {trophies.map((t) => (
              <MiniTrophyCard
                key={t.key}
                name={t.name}
                detail={t.detail}
                Icon={TROPHY_ICON[t.icon] ?? Trophy}
                gold={t.key === "mileclub" || t.key === "strong-season"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
