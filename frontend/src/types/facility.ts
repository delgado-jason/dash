export type FacilityKind = "business" | "job_site";

export interface Facility {
  facility_id: string;
  // A business is identified by its name; a job site (name may be null) by its
  // address.
  name: string | null;
  kind: FacilityKind;
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
