import { Trophy, Star, Minus } from "lucide-react";
import { Coin } from "@/components/forge/Coin";
import type {
  AgentHonors,
  SeasonEntry,
  LiveStanding,
} from "@/lib/metrics/agentLeaderboard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { PrestigeBurst, PRESTIGE_META } from "./PrestigeBadge";

const qLabel = (q: string) => {
  const [year, n] = q.split("-Q");
  return `Q${n} '${year.slice(2)}`;
};

// Provisional standing this quarter — visible but NOT part of the official
// record until the quarter closes.
const liveText = (s: LiveStanding) => {
  if (s.result === "gold") return "leading — provisional gold";
  if (s.result === "silver") return "running 2nd — provisional silver";
  if (s.result === "board") return `currently #${s.boardRank} — on the board`;
  if (s.boardRank == null) return `${s.loads} load${s.loads === 1 ? "" : "s"} — needs 2+ to make the board`;
  return `currently #${s.boardRank} — outside the top 5`;
};

const Live = ({ standing }: { standing: LiveStanding }) => (
  <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-amber/50 px-3 py-2">
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber shrink-0">
      <span className="w-2 h-2 rounded-full bg-amber animate-pulse" /> LIVE
    </span>
    {standing.result === "gold" || standing.result === "silver" ? (
      <Trophy
        size={16}
        style={{
          color: standing.result === "gold" ? "#f5b03a" : "#c3cad6",
          opacity: 0.7,
        }}
      />
    ) : standing.result === "board" ? (
      <Star size={16} style={{ color: "#e8940a", opacity: 0.7 }} />
    ) : null}
    <p className="text-sm text-dim">
      <span className="text-ink">{qLabel(standing.quarter)} in progress</span>{" "}
      · {liveText(standing)}
    </p>
  </div>
);

const resultIcon = (r: SeasonEntry["result"]) => {
  if (r === "gold") return <Coin metal="gold" size={22}>Q</Coin>;
  if (r === "silver") return <Coin metal="silver" size={22}>Q</Coin>;
  if (r === "board") return <Star size={18} style={{ color: "#e8940a" }} />;
  return <Minus size={16} className="text-dim" />;
};

export const TrophyCase = ({
  honors,
  log,
  live,
}: {
  honors?: AgentHonors;
  log: SeasonEntry[];
  live?: LiveStanding | null;
}) => {
  const tier = agentPrestige(honors);
  const meta = PRESTIGE_META[tier];
  const boarded = (honors?.board ?? 0) > 0;

  return (
    <div
      className="relative overflow-hidden rounded-lg p-4 border-2"
      style={{ background: "#10151f", borderColor: "#e8940a" }}
    >
      <div
        className="absolute top-0 right-0 w-28 h-28 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
          backgroundSize: "7px 7px",
          opacity: 0.12,
        }}
      />
      <div className="relative">
        <p
          className="font-comic text-base mb-3"
          style={{ color: "#f5b03a", letterSpacing: "1px" }}
        >
          TROPHY CASE
        </p>

        {!boarded ? (
        <p className="text-sm text-dim">
          No quarterly top-5 finishes yet — takes 2+ delivered loads in a quarter
          to make the board.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <PrestigeBurst tier={tier} size={56} />
            <div>
              <p className="font-comic text-2xl leading-none" style={{ color: meta.fill }}>
                {meta.label}
              </p>
              <div className="flex gap-4 text-sm mt-1">
                <span style={{ color: "#f5b03a" }}>
                  <Trophy size={15} className="inline -mt-0.5" /> {honors!.gold}{" "}
                  gold
                </span>
                <span style={{ color: "#c3cad6" }}>
                  <Trophy size={15} className="inline -mt-0.5" /> {honors!.silver}{" "}
                  silver
                </span>
                <span style={{ color: "#e8940a" }}>
                  <Star size={15} className="inline -mt-0.5" /> {honors!.board}{" "}
                  boards
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4 overflow-x-auto border-t border-[#3b4660] pt-3">
            {log.map((e) => (
              <div key={e.quarter} className="text-center min-w-[54px]">
                <div className="text-[11px] text-dim">
                  {qLabel(e.quarter)}
                </div>
                <div className="flex justify-center mt-1">
                  {resultIcon(e.result)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

        {live && <Live standing={live} />}
      </div>
    </div>
  );
};
