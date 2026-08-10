import { Coin, type CoinMetal } from "@/components/forge/Coin";
import type {
  AgentHonors,
  SeasonEntry,
  LiveStanding,
} from "@/lib/metrics/agentLeaderboard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { PRESTIGE_META } from "./PrestigeBadge";

const METALS: Record<string, CoinMetal> = {
  contender: "bronze",
  "all-star": "silver",
  champion: "gold",
  legend: "platinum",
};

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

// A board appearance — the punched pip from the tag language (appearances
// stack; only quarter WINS get struck as coins).
const Pip = ({ size = 10 }: { size?: number }) => (
  <span
    className="inline-block rounded-full shrink-0 align-middle"
    style={{
      width: size,
      height: size,
      background: "radial-gradient(circle at 40% 35%, #0a0e15 40%, #05070b)",
      boxShadow:
        "inset 0 2px 3px rgba(0,0,0,1), inset 0 -1px 1px rgba(245,176,58,.35)",
    }}
  />
);

// Not yet struck — the ghost slot (provisional standings, empty quarters).
const GhostSlot = ({ size = 20 }: { size?: number }) => (
  <span
    className="inline-block rounded-full shrink-0 border-2 border-dashed border-[#39445e]"
    style={{ width: size, height: size }}
  />
);

const Live = ({ standing }: { standing: LiveStanding }) => (
  <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-amber/50 px-3 py-2">
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber shrink-0">
      <span className="w-2 h-2 rounded-full bg-amber animate-pulse" /> LIVE
    </span>
    {standing.result === "gold" || standing.result === "silver" ? (
      <GhostSlot size={18} />
    ) : standing.result === "board" ? (
      <Pip />
    ) : null}
    <p className="text-sm text-dim">
      <span className="text-ink">{qLabel(standing.quarter)} in progress</span>{" "}
      · {liveText(standing)}
      {(standing.result === "gold" || standing.result === "silver") &&
        " — struck when the quarter closes"}
    </p>
  </div>
);

const resultMark = (r: SeasonEntry["result"]) => {
  if (r === "gold") return <Coin metal="gold" size={22}>Q</Coin>;
  if (r === "silver") return <Coin metal="silver" size={22}>Q</Coin>;
  if (r === "board") return <Pip />;
  return <GhostSlot />;
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
    <div className="ds2-board p-4">
      <p className="font-forge font-bold text-base mb-3 tracking-[.1em] text-amber-hi">
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
            {meta.label ? (
              <Coin metal={METALS[tier] ?? "bronze"} size={48}>
                {meta.label.charAt(0)}
              </Coin>
            ) : null}
            <div>
              <p className="font-forge font-bold text-2xl leading-none text-ink">
                {meta.label || "On the board"}
              </p>
              <div className="flex items-center gap-4 text-sm mt-1.5 text-dim">
                <span className="flex items-center gap-1.5">
                  <Coin metal="gold" size={15} /> {honors!.gold} gold
                </span>
                <span className="flex items-center gap-1.5">
                  <Coin metal="silver" size={15} /> {honors!.silver} silver
                </span>
                <span className="flex items-center gap-1.5">
                  <Pip /> {honors!.board} boards
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4 overflow-x-auto border-t ds2-cell-rule pt-3">
            {log.map((e) => (
              <div key={e.quarter} className="text-center min-w-[54px]">
                <div className="text-[11px] text-dim">{qLabel(e.quarter)}</div>
                <div className="flex justify-center items-center mt-1 h-[24px]">
                  {resultMark(e.result)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {live && <Live standing={live} />}
    </div>
  );
};
