import { Link } from "react-router-dom";
import type { AgentRevenue } from "@/lib/metrics/dashboard";
import type { AgentHonors, LiveStanding } from "@/lib/metrics/agentLeaderboard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { PrestigeBurst } from "@/components/agents/PrestigeBadge";

interface Props {
  agents: AgentRevenue[];
  honors: Map<string, AgentHonors>;
  standings: Map<string, LiveStanding>;
}

const fmtK = (n: number): string => `$${(n / 1000).toFixed(1)}k`;

export const TopAgents = ({ agents, honors, standings }: Props) => {
  if (agents.length === 0)
    return (
      <p className="text-muted-text text-sm">
        No agents with 2+ loads in the last 90 days.
      </p>
    );

  return (
    <div>
      {agents.map((agent, i) => {
        const tier = agentPrestige(honors.get(agent.agentId));
        const live = standings.get(agent.agentId);
        const onBoard =
          live &&
          (live.result === "gold" ||
            live.result === "silver" ||
            live.result === "board");
        return (
          <Link
            key={agent.agentId}
            to={`/agents/${agent.agentId}`}
            className="flex items-center gap-2.5 py-1.5 border-t border-[#232c3f] first:border-t-0 hover:opacity-80"
          >
            <span
              className={`w-3.5 text-right font-condensed ${
                i === 0 ? "text-amber" : "text-muted-text"
              }`}
            >
              {i + 1}
            </span>
            <span className="w-[26px] shrink-0 flex justify-center">
              <PrestigeBurst tier={tier} size={26} />
            </span>
            <span
              className={`flex-1 text-sm truncate ${
                i === 0 ? "text-amber-light" : "text-light"
              }`}
            >
              {agent.agent}
            </span>
            {onBoard && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse shrink-0"
                title="on the board this quarter"
              />
            )}
            <span className="text-right shrink-0">
              <span className="block text-sm font-condensed">
                {fmtK(agent.revenue)}
              </span>
              <span className="block text-[10px] text-muted-text">
                {agent.loadCount} loads
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
};
