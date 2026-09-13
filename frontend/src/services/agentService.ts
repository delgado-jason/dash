import api from "./api";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentRatingHistory } from "@/types/agentRatingHistory";
import type { AgentNote } from "@/types/agentNote";
import { withCustomerEnd } from "./loadsService";

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
      // Decision 5A (074): the agent dossier's loads are footprint readers too
      // — coerce the mark here, exactly as loadsService does, so a row served
      // without customer_end reads as 'shipper' instead of undefined.
      loads: (response.data.loads as Load[]).map(withCustomerEnd),
      notes: response.data.notes,
      ratingHistory: response.data.ratingHistory,
    };
  } catch {
    throw new Error("Unable to fetch agent");
  }
};
