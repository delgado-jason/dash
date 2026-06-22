import api from "./api";
import type { AgentNote } from "@/types/agentNote";

interface AgentNoteInput {
  note: string;
  created_by: string;
}

export const createAgentNote = async (
  agent_id: string,
  data: AgentNoteInput,
): Promise<AgentNote> => {
  try {
    const response = await api.post(`/agents/${agent_id}/notes`, data);
    return response.data.agentNote;
  } catch {
    throw new Error("Unable to create new note");
  }
};
