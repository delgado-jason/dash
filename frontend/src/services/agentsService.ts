import api from "./api";
import type { Agent } from "@/types/agent";

export const getAgents = async (): Promise<Agent[]> => {
  try {
    const response = await api.get("/agents");
    return response.data.agents;
  } catch {
    throw new Error("Unable to fetch agents");
  }
};
