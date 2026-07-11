export type ComplianceScope = "business" | "driver" | "truck" | "trailer";

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
