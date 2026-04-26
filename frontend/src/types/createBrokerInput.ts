export interface CreateBrokerInput {
  broker_name: string;
  phone: string | null;
  email: string | null;
  rating: number | null;
  notes: string | null;
}
