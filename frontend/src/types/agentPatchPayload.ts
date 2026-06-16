export interface AgentPatchPayload {
  broker_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string | null;
  preferred_contact?: string;
  rating?: number | null;
  notes?: string | null;
  reason?: string; // only when rating changes
  changed_by?: string; // only when rating changes
}
