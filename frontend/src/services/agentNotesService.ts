import api from "./api";
import { AxiosError } from "axios";
import type { AgentNote } from "@/types/agentNote";

// Every agent's notes in one read — the Relationships surface scans them for
// skip markers ("[milestone:loads-5:skipped]"), which live in an agent note
// rather than a contact so a skip never counts as a touch. A failed read
// THROWS, like agents and loads: an empty list would silently reopen every
// skipped flag and offer Brandie a note she already chose not to send. The
// hook records the failure as its own slice error and the layout shows the
// lamp; the rest of Today still renders from the slices that landed.
export const getAgentNotes = async (): Promise<AgentNote[]> => {
  try {
    const res = await api.get("/agent-notes");
    return res.data.notes ?? [];
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(String(error.response.data.error));
    }
    throw new Error("couldn't load the agent notes");
  }
};
