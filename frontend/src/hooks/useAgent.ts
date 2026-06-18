import { useState, useEffect } from "react";
import type { Agent } from "@/types/agent";
import { getAgent } from "@/services/agentService";
import { useParams } from "react-router";

export const useAgent = (refreshKey: number = 0) => {
  const [agent, setAgent] = useState<Agent>();
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
        setAgent(data);
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
    isLoading,
    error,
  };
};
