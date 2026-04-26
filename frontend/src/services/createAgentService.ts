import api from "./api";
import type { Agent } from "@/types/agent";
import type { CreateAgentInput } from "@/types/createAgentInput";

export const createAgent = async (data: CreateAgentInput): Promise<Agent> => {
  try {
    const response = await api.post("/agents", data);
    return response.data.agent;
  } catch {
    throw new Error("Unable to create new agent");
  }
};
