import { Link } from "react-router-dom";
import type { AgentRevenue } from "@/lib/metrics/dashboard";

interface Props {
  agents: AgentRevenue[];
}

const fmtK = (n: number): string => `$${(n / 1000).toFixed(1)}k`;

export const TopAgents = ({ agents }: Props) => {
  if (agents.length === 0)
    return (
      <p className="text-muted-text text-sm">
        No agents with 2+ loads in the last 90 days.
      </p>
    );

  const max = agents[0].revenue || 1;

  return (
    <div>
      {agents.map((agent, i) => (
        <Link
          key={agent.agentId}
          to={`/agents/${agent.agentId}`}
          className="flex items-center gap-2 py-1.5 hover:opacity-80"
        >
          <span className="w-4 text-right text-xs text-muted-text">{i + 1}</span>
          <span className="w-24 text-sm text-light truncate">{agent.agent}</span>
          <span className="flex-1 h-1.5 bg-steel rounded-full">
            <span
              className="block h-1.5 bg-amber rounded-full"
              style={{ width: `${(agent.revenue / max) * 100}%` }}
            />
          </span>
          <span className="w-16 text-right">
            <span className="block text-sm font-semibold text-light">
              {fmtK(agent.revenue)}
            </span>
            <span className="block text-[11px] text-muted-text">
              {agent.loadCount} loads
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
};
