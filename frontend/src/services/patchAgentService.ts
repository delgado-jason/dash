import api from "./api";
import { AxiosError } from "axios";
import type { Agent } from "@/types/agent";
import type { AgentPatchPayload } from "@/types/agentPatchPayload";

export const patchAgent = async (
  agent_id: string,
  data: AgentPatchPayload,
): Promise<Agent> => {
  try {
    const response = await api.patch(`/agents/${agent_id}`, data);
    return response.data.agent;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to patch agent");
  }
};
