// A Landstar agency: its legal name off the freight bill plus its own 3-letter
// agency code — the shared desk. The agents inside it each carry their own
// posting code (agents.posting_code); null there means they post from here.
export interface Agency {
  agency_id: string;
  user_id: string;
  agency_code: string;
  // NULL until a freight bill names it.
  name: string | null;
  // Every posting code this agency has ever posted under (075 §5d): its own
  // code, each agent's, and desks nobody works any more. Read-only evidence —
  // the settlement feed appends to it; no client ever writes it. `{}` in
  // Postgres arrives as [].
  posting_codes: string[];
  phone?: string | null;
  email?: string | null;
  rating?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}
