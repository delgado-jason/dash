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
  created_at: string;
  updated_at: string;
}
