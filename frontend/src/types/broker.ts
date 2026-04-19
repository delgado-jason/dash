export interface Broker {
  broker_id: string;
  broker_name: string;
  phone?: string | null;
  email?: string | null;
  rating?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}
