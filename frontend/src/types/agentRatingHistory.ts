export interface AgentRatingHistory {
  id: string;
  agent_id: string;
  old_rating?: number | null;
  new_rating: number;
  reason: string;
  changed_by: string;
  changed_at: string;
}
