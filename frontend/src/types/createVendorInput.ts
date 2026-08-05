// Create payload. The backend skips `undefined` fields and the DB fills defaults
// (status → 'active'), so optional (`?:`) is the right shape — send only what the
// user filled.
export interface CreateVendorInput {
  name: string;
  category: string;
  rating?: number | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  service_area?: string | null;
  status?: string;
  notes?: string | null;
}
