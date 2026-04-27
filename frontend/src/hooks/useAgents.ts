import { useState, useEffect } from "react";
import type { Agent } from "@/types/agent";
import { getAgents } from "@/services/agentsService";

export const useAgents = (refreshKey: number = 0) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await getAgents();
        setAgents(data);
      } catch {
        setError("Failed to load agents");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgents();
  }, [refreshKey]);

  return {
    agents,
    isLoading,
    error,
  };
};
