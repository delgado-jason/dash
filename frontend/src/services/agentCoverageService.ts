import api from "./api";

// What an agent SAYS they cover. Claimed intel — deliberately separate from
// `facilities`, which stays a factual record of where the truck has been.
// `source` is the confidence flag: 'stated' until a load proves it 'confirmed'.
export interface AgentCoverage {
  coverage_id: string;
  agent_id: string;
  city: string;
  state: string;
  shipper_name: string | null; // null is the normal case — they name markets
  source: "stated" | "confirmed";
  confirmed_load_id: string | null;
  notes: string | null;
  created_at: string;
}

export const getAgentCoverage = async (): Promise<AgentCoverage[]> => {
  const res = await api.get("/agent-coverage");
  return res.data.coverage ?? [];
};

export const createAgentCoverage = async (data: {
  agent_id: string;
  city: string;
  state: string;
  shipper_name?: string | null;
  notes?: string | null;
}): Promise<AgentCoverage> => {
  const res = await api.post("/agent-coverage", data);
  return res.data.coverage;
};

export const deleteAgentCoverage = async (id: string): Promise<void> => {
  await api.delete(`/agent-coverage/${id}`);
};
