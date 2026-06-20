import { useState, useEffect } from "react";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import { getAgent } from "@/services/agentService";
import { useParams } from "react-router";

export const useAgent = (refreshKey: number = 0) => {
  const [agent, setAgent] = useState<Agent>();
  const [loads, setLoads] = useState<Load[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { agent_id } = useParams();

  useEffect(() => {
    if (!agent_id) {
      setError("No agent specified");
      setIsLoading(false);
      return;
    }

    const fetchAgent = async () => {
      try {
        const data = await getAgent(agent_id);
        setAgent(data.agent);
        setLoads(data.loads);
      } catch {
        setError("Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgent();
  }, [refreshKey, agent_id]);

  return {
    agent,
    loads,
    isLoading,
    error,
  };
};
