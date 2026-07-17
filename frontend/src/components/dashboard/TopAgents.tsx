import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import type { AgentRevenue } from "@/lib/metrics/dashboard";
import type { AgentHonors, LiveStanding } from "@/lib/metrics/agentLeaderboard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { PrestigeBurst } from "@/components/agents/PrestigeBadge";

interface Props {
  agents: AgentRevenue[];
  honors: Map<string, AgentHonors>;
  standings: Map<string, LiveStanding>;
}

// agent.revenue is GROSS (see getTopAgentsByRevenue) — agents are graded on the
// market value they bring, the same way on every dashboard.
const fmtK = (n: number): string => `$${(n / 1000).toFixed(1)}k`;

// Gold, silver, bronze for the podium (index 0/1/2).
const MEDAL = [
  { bg: "#f5b03a", fg: "#3a2400" },
  { bg: "#c8d0dc", fg: "#2a3040" },
  { bg: "#c9884a", fg: "#2a1808" },
];

const Rank = ({ i }: { i: number }) =>
  i < 3 ? (
    <span
      className="font-comic shrink-0 flex items-center justify-center text-[15px]"
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: MEDAL[i].bg,
        color: MEDAL[i].fg,
        border: "2px solid #10151f",
      }}
    >
      {i + 1}
    </span>
  ) : (
    <span
      className="font-comic shrink-0 text-center text-muted-text text-[15px]"
      style={{ width: 26 }}
    >
      {i + 1}
    </span>
  );

const Pulse = () => (
  <span
    className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse shrink-0"
    title="on the board this quarter"
  />
);

export const TopAgents = ({ agents, honors, standings }: Props) => (
  <div
    className="relative overflow-hidden rounded-2xl border-2 p-4"
    style={{ background: "#10151f", borderColor: "#e8940a" }}
  >
    <div
      className="absolute top-0 right-0 w-24 h-24 pointer-events-none"
      style={{
        backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
        backgroundSize: "7px 7px",
        opacity: 0.12,
      }}
    />

    <div className="relative flex items-center gap-2 mb-2.5">
      <Trophy size={17} style={{ color: "#f5b03a" }} />
      <span className="font-comic text-xl" style={{ color: "#f5b03a" }}>
        TOP AGENTS
      </span>
      <span className="flex-1" />
      <span className="text-[10px] text-muted-text">gross · 90 days</span>
    </div>

    {agents.length === 0 ? (
      <p className="relative text-muted-text text-sm">
        No agents with 2+ loads in the last 90 days.
      </p>
    ) : (
      <div className="relative">
        {agents.map((agent, i) => {
          const tier = agentPrestige(honors.get(agent.agentId));
          const live = standings.get(agent.agentId);
          const onBoard =
            !!live &&
            (live.result === "gold" ||
              live.result === "silver" ||
              live.result === "board");
          const first = i === 0;

          const inner = (
            <>
              <Rank i={i} />
              <span className="w-[22px] shrink-0 flex justify-center">
                <PrestigeBurst tier={tier} size={22} />
              </span>
              <span className="flex-1 min-w-0">
                {first ? (
                  <span
                    className="font-comic block truncate leading-none text-[17px]"
                    style={{ color: "#f5b03a" }}
                  >
                    {agent.agent}
                  </span>
                ) : (
                  <span className="block truncate text-sm text-light">
                    {agent.agent}
                  </span>
                )}
                {first && onBoard && (
                  <span className="flex items-center gap-1.5 mt-1">
                    <Pulse />
                    <span className="text-[9px] text-muted-text">
                      on the board this quarter
                    </span>
                  </span>
                )}
              </span>
              {!first && onBoard && <Pulse />}
              <span className="text-right shrink-0">
                <span
                  className="font-comic block leading-none"
                  style={{
                    fontSize: first ? 19 : 15,
                    color: first ? "#f5b03a" : i < 3 ? "#e8eef7" : "#9daabb",
                  }}
                >
                  {fmtK(agent.revenue)}
                </span>
                <span className="block text-[10px] text-muted-text">
                  {agent.loadCount} loads
                </span>
              </span>
            </>
          );

          return first ? (
            <Link
              key={agent.agentId}
              to={`/agents/${agent.agentId}`}
              className="flex items-center gap-2.5 rounded-[10px] p-2 mb-1 hover:opacity-80"
              style={{ background: "rgba(232,148,10,0.12)", border: "1px solid #7a4718" }}
            >
              {inner}
            </Link>
          ) : (
            <Link
              key={agent.agentId}
              to={`/agents/${agent.agentId}`}
              className="flex items-center gap-2.5 py-2 px-1 border-t border-[#232c3f] hover:opacity-80"
            >
              {inner}
            </Link>
          );
        })}
      </div>
    )}
  </div>
);
