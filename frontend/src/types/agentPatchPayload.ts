export interface AgentPatchPayload {
  broker_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string | null;
  preferred_contact?: string;
  rating?: number | null;
  notes?: string | null;
  agent_class?: "direct" | "spot" | null; // null clears the override back to auto
  reason?: string; // only when rating changes
  changed_by?: string; // only when rating changes
  relationship_tier?: number;
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
}
