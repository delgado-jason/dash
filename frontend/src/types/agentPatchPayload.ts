export interface AgentPatchPayload {
  // null clears the agency code — a prospect is a person first (073).
  broker_id?: string | null;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string | null;
  preferred_contact?: string;
  best_time_to_call?: string | null;
  rating?: number | null;
  notes?: string | null;
  // null clears the override back to auto; 'unclear' means asked and couldn't
  // tell, which is NOT the same as never asked and never permits parking.
  agent_class?: "direct" | "unclear" | "spot" | null;
  work_status?: "active" | "parked";
  park_reason?: string | null;
  freight_types?: string[];
  // `reason` rides along with a rating change (with `changed_by` initials) AND
  // with a tier change (REL-01 v2.0: the owner sets tiers, always with a
  // written reason — the backend refuses a tier move without one).
  reason?: string;
  changed_by?: string; // only when rating changes
  // 1 | 2 | 3, or null = no tier (back to Prospect). Owner only.
  relationship_tier?: number | null;
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
}
