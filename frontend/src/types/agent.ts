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
  // Manual relationship-bucket override. Three states with three meanings:
  //   null/absent  never asked        — auto (derived from loads) is in charge
  //   'unclear'    asked, can't tell  — stays in the working book
  //   'direct' | 'spot'               — asked and answered; only a pinned
  //                                     'spot' may ever park an agent
  agent_class?: "direct" | "unclear" | "spot" | null;
  // 'parked' leaves every working view (due queue, call lists, sweep) but stays
  // in every analytical one. The DB refuses to park a non-pinned-'spot' agent.
  work_status?: "active" | "parked";
  // Claimed capability, mirroring the load_type enum.
  freight_types?: string[];
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
