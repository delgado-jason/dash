import api from "./api";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentRatingHistory } from "@/types/agentRatingHistory";
import type { AgentNote } from "@/types/agentNote";

interface GetAgentResponse {
  agent: Agent;
  loads: Load[];
  notes: AgentNote[];
  ratingHistory: AgentRatingHistory[];
}

export const getAgent = async (agent_id: string): Promise<GetAgentResponse> => {
  try {
    const response = await api.get(`/agents/${agent_id}`);
    return {
      agent: response.data.agent,
      loads: response.data.loads,
      notes: response.data.notes,
      ratingHistory: response.data.ratingHistory,
    };
  } catch {
    throw new Error("Unable to fetch agent");
  }
};
