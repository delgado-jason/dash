export type ComplianceScope = "business" | "driver" | "truck" | "trailer";

// The newest closed cycle, carried on the LIST rows so the history line under a
// row costs no extra request. Four fields only — the full row is what
// `getComplianceRenewals` fetches when the "n earlier" fold opens.
export interface LastRenewal {
  renewal_id: string;
  renewed_on: string; // 'YYYY-MM-DD'
  expired_on: string | null; // what the cycle it closed was due
  next_expires_on: string | null;
}

// One closed cycle, in full, as the history endpoint returns it.
export interface ComplianceRenewal {
  renewal_id: string;
  issued_on: string | null;
  expired_on: string | null;
  doc_number: string | null;
  renewed_on: string;
  next_expires_on: string | null;
  note: string | null;
  renewed_by: string | null; // the login; null once that login is deleted
  renewed_by_name: string | null; // LEFT JOIN users — nullable both ways
  created_at: string;
}

// What the sheet sends. `next_expires_on` may be null only when the item
// carries a cadence for the server to compute from.
export interface RenewalInput {
  renewed_on: string;
  next_expires_on: string | null;
  doc_number?: string | null;
  note?: string | null;
}

export interface ComplianceItem {
  compliance_item_id: string;
  scope: ComplianceScope;
  driver_id: string | null;
  truck_id: string | null;
  trailer_id: string | null;
  label: string;
  category: string | null;
  issued_on: string | null; // 'YYYY-MM-DD'
  expires_on: string | null; // 'YYYY-MM-DD' — the date the engine keys on
  renewal_months: number | null;
  warn_lead_days: number;
  doc_number: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // From the list endpoint's LATERAL. `?:` rather than `| null`: the PATCH /
  // POST responses return the item alone and carry neither key.
  last_renewal?: LastRenewal | null;
  renewal_count?: number;
}

export interface ComplianceItemInput {
  scope: ComplianceScope;
  driver_id?: string | null;
  truck_id?: string | null;
  trailer_id?: string | null;
  label: string;
  category?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  renewal_months?: number | null;
  warn_lead_days?: number;
  doc_number?: string | null;
  notes?: string | null;
}
