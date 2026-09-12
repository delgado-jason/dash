import api from "./api";
import { AxiosError } from "axios";
import type { ContactType } from "@/lib/relationships/contactTypes";

export type ContactDirection = "outbound" | "inbound";
export type ContactMethod = "call" | "email" | "text";
export type ContactOutcome = "reached" | "voicemail" | "no_answer" | "bad_number";
export type ContactNextStep = "call_back" | "on_their_list" | "send_capacity" | "none";

// One touch, either direction. v2 (073) added what the touch carried: its
// outcome (calls), the next step owed, the footprint flag, the OTHER reasons
// folded into the same message (the one-a-week cap), and a cap override.
export interface AgentContact {
  contact_id: string;
  agent_id: string;
  contacted_at: string; // ISO
  direction: ContactDirection;
  method: ContactMethod;
  type: ContactType;
  note: string | null;
  load_id: string | null;
  outcome: ContactOutcome | null;
  next_step: ContactNextStep | null;
  next_step_at: string | null; // 'YYYY-MM-DD' — the API sends the DATE as text
  footprint_captured: boolean;
  combined_types: ContactType[] | null;
  cap_override: boolean;
}

export interface CreateAgentContactInput {
  agent_id: string;
  direction: ContactDirection;
  method: ContactMethod;
  type: ContactType;
  contacted_at?: string;
  note?: string | null;
  load_id?: string | null;
  outcome?: ContactOutcome | null;
  next_step?: ContactNextStep | null;
  next_step_at?: string | null;
  footprint_captured?: boolean;
  combined_types?: ContactType[] | null;
  cap_override?: boolean;
}

// What may change after the fact — the fold and the follow-up bookkeeping.
// Never the touch's identity; a mis-log is deleted, not rewritten.
export type PatchAgentContactInput = Partial<
  Pick<
    AgentContact,
    "note" | "outcome" | "next_step" | "next_step_at" | "footprint_captured" | "combined_types"
  >
>;

// Surface the backend's own sentence ("type must be one of …") instead of a
// generic failure — every write on the Relationships surface shows its error
// by name.
const named = (error: unknown, fallback: string): Error => {
  if (error instanceof AxiosError && error.response?.data?.error) {
    return new Error(String(error.response.data.error));
  }
  return new Error(fallback);
};

export const getAgentContacts = async (): Promise<AgentContact[]> => {
  const res = await api.get("/agent-contacts");
  return res.data.contacts ?? [];
};

export const createAgentContact = async (
  data: CreateAgentContactInput,
): Promise<AgentContact> => {
  try {
    const res = await api.post("/agent-contacts", data);
    return res.data.contact;
  } catch (error) {
    throw named(error, "Couldn't log the touch");
  }
};

export const patchAgentContact = async (
  id: string,
  data: PatchAgentContactInput,
): Promise<AgentContact> => {
  try {
    const res = await api.patch(`/agent-contacts/${id}`, data);
    return res.data.contact;
  } catch (error) {
    throw named(error, "Couldn't update the touch");
  }
};

export const deleteAgentContact = async (id: string): Promise<void> => {
  try {
    await api.delete(`/agent-contacts/${id}`);
  } catch (error) {
    throw named(error, "Couldn't remove the touch");
  }
};
