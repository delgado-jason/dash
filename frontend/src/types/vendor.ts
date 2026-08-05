export interface Vendor {
  vendor_id: string;
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
  status: string; // 'active' | 'inactive'
  notes?: string | null;
  created_at: string;
  updated_at: string;

  // Derived, shop-only spend from the maintenance log (matched by name). numeric
  // comes back as a STRING; null for non-shops or shops with no matched services.
  total_spend?: string | null;
  service_count?: number | null;
  last_service?: string | null;
}
