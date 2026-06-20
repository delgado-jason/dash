import api from "./api";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";

interface GetAgentResponse {
  agent: Agent;
  loads: Load[];
}

export const getAgent = async (agent_id: string): Promise<GetAgentResponse> => {
  try {
    const response = await api.get(`/agents/${agent_id}`);
    return {
      agent: response.data.agent,
      loads: response.data.loads,
    };
  } catch {
    throw new Error("Unable to fetch agent");
  }
};
