import api from "./api";
import type { Agent } from "@/types/agent";

export const getAgent = async (agent_id: string): Promise<Agent> => {
  try {
    const response = await api.get(`/agents/${agent_id}`);
    return response.data.agent;
  } catch {
    throw new Error("Unable to fetch agent");
  }
};
