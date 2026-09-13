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

// Non-fatal on failure, matching getCityCoords: this read is one of several in
// the Relationships page's fetch, and coverage is optional to every view
// except the call screen's footprint. Letting it reject would take the whole
// page — the book and the review included — down to its error state over a
// feature they don't use. An empty list degrades the footprint to "nothing
// captured yet" and leaves everything else working.
//
// The WRITES below still throw: those are user actions, and a silent failure
// there would lose a market she just captured on a call.
export const getAgentCoverage = async (): Promise<AgentCoverage[]> => {
  try {
    const res = await api.get("/agent-coverage");
    return res.data.coverage ?? [];
  } catch {
    return [];
  }
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
