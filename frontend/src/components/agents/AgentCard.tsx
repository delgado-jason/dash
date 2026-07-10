import { Link } from "react-router";
import type { Agent } from "@/types/agent";
import type {
  AgentHonors,
  AgentStat,
  LiveStanding,
} from "@/lib/metrics/agentLeaderboard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { RatingMedallion } from "./RatingMedallion";
import { PrestigeBadge, PRESTIGE_META } from "./PrestigeBadge";

// Short live blurb — only shown on the card when the agent is currently on the
// board this quarter, so it stays a highlight rather than clutter.
const liveBlurb = (live: LiveStanding): string | null => {
  if (live.result === "gold") return "leading this quarter";
  if (live.result === "silver") return "running 2nd this quarter";
  if (live.result === "board") return `#${live.boardRank} this quarter`;
  return null;
};

const money0 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const fmtDate = (d: string | null) =>
  d
    ? new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

export const AgentCard = ({
  agent,
  stats,
  honors,
  live,
}: {
  agent: Agent;
  stats?: AgentStat;
  honors?: AgentHonors;
  live?: LiveStanding | null;
}) => {
  const tier = agentPrestige(honors);
  const prestige = PRESTIGE_META[tier];
  const blurb = live ? liveBlurb(live) : null;

  return (
    <Link
      to={`/agents/${agent.agent_id}`}
      className="relative overflow-hidden block bg-plate border border-[#3b4660] rounded-lg p-3.5 hover:border-amber transition-colors"
    >
      <PrestigeBadge tier={tier} />

      <div className="flex gap-3 items-center">
        <div className="size-11 rounded-full bg-steel border-2 border-amber flex items-center justify-center font-condensed font-semibold text-lg text-amber-light shrink-0">
          {agent.first_name.charAt(0)}
          {agent.last_name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-condensed text-lg leading-tight truncate">
            {agent.first_name} {agent.last_name}
          </p>
          <p className="text-xs text-muted-text truncate">
            {agent.broker_name} · Landstar
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <RatingMedallion rating={agent.rating} />
        {prestige.label && (
          <span
            className="text-[11px] font-medium uppercase tracking-wide shrink-0"
            style={{ color: prestige.fill }}
          >
            {prestige.label}
          </span>
        )}
      </div>

      {blurb && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          <span className="text-amber font-medium">LIVE</span>
          <span className="text-muted-text">{blurb}</span>
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-[#3b4660] text-xs text-muted-text">
        {stats?.loadCount ?? 0} loads · {money0(stats?.revenue ?? 0)} ·{" "}
        {fmtDate(stats?.lastWorked ?? null)}
      </div>
    </Link>
  );
};
