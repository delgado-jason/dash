import api from "./api";

export interface AgentContact {
  contact_id: string;
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  method: "call" | "email" | "text";
  type: "capacity" | "check_in" | "appreciation" | "close_out" | "cold" | "inbound_inquiry" | "other";
  note: string | null;
  load_id: string | null;
}

export const getAgentContacts = async (): Promise<AgentContact[]> => {
  const res = await api.get("/agent-contacts");
  return res.data.contacts ?? [];
};

export const createAgentContact = async (
  data: Omit<AgentContact, "contact_id" | "contacted_at" | "note" | "load_id"> & {
    contacted_at?: string;
    note?: string | null;
    load_id?: string | null;
  },
): Promise<AgentContact> => {
  const res = await api.post("/agent-contacts", data);
  return res.data.contact;
};

export const deleteAgentContact = async (id: string): Promise<void> => {
  await api.delete(`/agent-contacts/${id}`);
};
