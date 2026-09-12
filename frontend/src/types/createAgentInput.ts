export interface CreateAgentInput {
  // Optional since 073 — a prospect may arrive with no agency code.
  broker_id: string | null;
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
  best_time_to_call?: string | null;
  // No relationship_tier here on purpose: a new agent lands with no tier (a
  // Prospect) and the server refuses one on create — the owner sets tiers
  // later, with a reason, through the gated PATCH.
}
