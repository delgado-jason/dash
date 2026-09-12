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
    // Surface the backend's own sentence AND its details, so "Validation
    // failed" arrives with the reason ("relationship_tier must be 1, 2, 3, or
    // null") — same shape as createAgentService.
    if (error instanceof AxiosError && error.response?.data) {
      const body = error.response.data as { error?: string; details?: string[] };
      const detail = Array.isArray(body.details) && body.details.length ? ` — ${body.details.join("; ")}` : "";
      if (body.error) throw new Error(`${body.error}${detail}`);
    }
    throw new Error("Unable to patch agent");
  }
};
