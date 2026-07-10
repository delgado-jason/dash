import { Trophy, Star, Minus } from "lucide-react";
import type { AgentHonors, SeasonEntry } from "@/lib/metrics/agentLeaderboard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { PrestigeBurst, PRESTIGE_META } from "./PrestigeBadge";

const qLabel = (q: string) => {
  const [year, n] = q.split("-Q");
  return `Q${n} '${year.slice(2)}`;
};

const resultIcon = (r: SeasonEntry["result"]) => {
  if (r === "gold") return <Trophy size={18} style={{ color: "#f5b03a" }} />;
  if (r === "silver") return <Trophy size={18} style={{ color: "#c3cad6" }} />;
  if (r === "board") return <Star size={18} style={{ color: "#e8940a" }} />;
  return <Minus size={16} className="text-muted-text" />;
};

export const TrophyCase = ({
  honors,
  log,
}: {
  honors?: AgentHonors;
  log: SeasonEntry[];
}) => {
  const tier = agentPrestige(honors);
  const meta = PRESTIGE_META[tier];
  const boarded = (honors?.board ?? 0) > 0;

  return (
    <div className="bg-plate rounded-lg p-4">
      <p className="text-xs text-muted-text uppercase tracking-wider mb-3">
        Trophy case
      </p>

      {!boarded ? (
        <p className="text-sm text-muted-text">
          No quarterly top-5 finishes yet — takes 2+ delivered loads in a quarter
          to make the board.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <PrestigeBurst tier={tier} size={56} />
            <div>
              <p className="font-condensed text-xl" style={{ color: meta.fill }}>
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
                <div className="text-[11px] text-muted-text">
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
    </div>
  );
};
