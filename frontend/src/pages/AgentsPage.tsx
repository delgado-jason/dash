import { useMemo } from "react";
import { Link } from "react-router";
import { useAgents } from "@/hooks/useAgents";
import { RatingDisplay } from "@/components/RatingDisplay";

const AgentsPage = () => {
  const { agents, isLoading, error } = useAgents();

  // Sort by rating desc; unrated (null) sinks to the bottom
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }, [agents]);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light font-body">
        <p className="text-muted-text">Loading agents...</p>
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed text-light mb-6">Agents</h1>

      <div className="flex flex-col gap-2">
        {sortedAgents.map((agent) => (
          <Link
            key={agent.agent_id}
            to={`/agents/${agent.agent_id}`}
            className="flex items-center gap-4 bg-plate hover:bg-steel border border-iron rounded-lg p-3 transition-colors"
          >
            {/* Monogram */}
            <div className="flex rounded-full items-center bg-steel justify-center size-12 text-lg font-display text-light shrink-0">
              {agent.first_name.charAt(0)}
              {agent.last_name.charAt(0)}
            </div>

            {/* Name + broker */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-light">
                {agent.first_name + " " + agent.last_name}
              </p>
              <p className="text-sm text-muted-text">
                {agent.broker_name} · Landstar Agent
              </p>
            </div>

            {/* Rating pinned right */}
            <div className="shrink-0">
              <RatingDisplay rating={agent.rating} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AgentsPage;
