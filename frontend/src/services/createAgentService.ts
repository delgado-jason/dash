import api from "./api";
import { AxiosError } from "axios";
import type { Agent } from "@/types/agent";
import type { CreateAgentInput } from "@/types/createAgentInput";

// Surfaces the backend's own sentence (a duplicate name, a validation detail)
// so + Prospect can show its error by name instead of a generic failure.
export const createAgent = async (data: CreateAgentInput): Promise<Agent> => {
  try {
    const response = await api.post("/agents", data);
    return response.data.agent;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data) {
      const body = error.response.data as { error?: string; details?: string[] };
      const detail = Array.isArray(body.details) && body.details.length ? ` — ${body.details.join("; ")}` : "";
      if (body.error) throw new Error(`${body.error}${detail}`);
    }
    throw new Error("Unable to create new agent");
  }
};
