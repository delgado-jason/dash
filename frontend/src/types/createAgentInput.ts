export interface CreateAgentInput {
  broker_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact: string | null;
  rating: number | null;
  notes: string | null;
  // Prospect fields (relationship system) — all optional on create.
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
}
