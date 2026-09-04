export interface Agent {
  agent_id: string;
  broker_id: string;
  broker_name: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  preferred_contact: string;
  rating?: number | null;
  notes?: string | null;
  // Manual relationship-bucket override. null/absent = auto (derived from loads).
  agent_class?: "direct" | "spot" | null;
  // Relationship system (2026-09-03): the tier is the OWNER'S call (1/2/3,
  // default 3); city/state/source describe prospects for the cold pool.
  relationship_tier: number;
  tier_set_at?: string | null;
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
  created_at: string;
  updated_at: string;
}
