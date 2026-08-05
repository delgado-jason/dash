export interface VendorPatchPayload {
  name?: string;
  category?: string;
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
  reason?: string; // only when rating changes
  changed_by?: string; // only when rating changes
}
