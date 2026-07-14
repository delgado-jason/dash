export interface Facility {
  facility_id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// List rows carry per-facility load counts by role (as_shipper / as_receiver).
export interface FacilityRow extends Facility {
  as_shipper: number;
  as_receiver: number;
}
