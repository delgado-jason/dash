export interface Agent {
  agent_id: string;
  // The agency code is billing paperwork; a prospect may not have one yet
  // (073). null → the book shows a NO CODE chip.
  broker_id: string | null;
  broker_name: string | null;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  // 'phone' | 'email' | 'text'; null until someone asks — every prospect
  // starts without one.
  preferred_contact: string | null;
  // The footprint's sixth question, free text ("mornings before 10").
  best_time_to_call?: string | null;
  rating?: number | null;
  notes?: string | null;
  // Manual relationship-bucket override. Three states with three meanings:
  //   null/absent  never asked        — auto (derived from loads) is in charge
  //   'unclear'    asked, can't tell  — stays in the working book
  //   'direct' | 'spot'               — asked and answered; only a pinned
  //                                     'spot' may ever park an agent
  agent_class?: "direct" | "unclear" | "spot" | null;
  // 'parked' leaves every working view (Today, the Call list, the Foreman) but
  // stays in every analytical one. The DB refuses to park a non-pinned-'spot' agent.
  work_status?: "active" | "parked";
  // Why they left the call book. Required to park unless agent_class is a
  // pinned 'spot' — so nobody is ever parked by inference.
  park_reason?: string | null;
  // Claimed capability, mirroring the load_type enum.
  freight_types?: string[];
  // REL-01 v2.0: the tier is the OWNER'S explicit call (1/2/3) or null = no
  // tier — a Prospect, or dormant → Parked (derived, lib/relationships/buckets).
  // dash suggests a tier from all-in RPM; it never writes one.
  relationship_tier: number | null;
  tier_set_at?: string | null;
  agent_city?: string | null;
  agent_state?: string | null;
  source?: string | null;
  created_at: string;
  updated_at: string;
}
