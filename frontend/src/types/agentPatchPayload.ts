export interface AgentPatchPayload {
  broker_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string | null;
  preferred_contact?: string;
  rating?: number | null;
  notes?: string | null;
  // null clears the override back to auto; 'unclear' means asked and couldn't
  // tell, which is NOT the same as never asked and never permits parking.
  agent_class?: "direct" | "unclear" | "spot" | null;
  work_status?: "active" | "parked";
  park_reason?: string | null;
  freight_types?: string[];
  reason?: string; // only when rating changes
  changed_by?: string; // only when rating changes
  relationship_tier?: number;
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
}
