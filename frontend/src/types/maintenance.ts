export type MaintenanceUnit = "tractor" | "trailer";

export interface MaintenanceItem {
  item_id: string;
  unit: MaintenanceUnit;
  name: string;
  category: string;
  interval_miles: number | null;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_miles: number | null;
  last_done_date: string | null; // 'YYYY-MM-DD'
  warn_lead_days: number; // start flagging "due soon" this many days before due
  truck_id: string | null;
  trailer_id: string | null;
  active: boolean;
  notes: string | null;
}

// Costs are for vendor pricing only — never rolled into the P&L. Receipts live
// in QuickBooks, so there's no receipt field here.
export interface MaintenanceService {
  service_id: string;
  unit: MaintenanceUnit;
  service_date: string; // 'YYYY-MM-DD'
  odometer: number | null;
  vendor: string | null;
  location: string | null;
  description: string;
  cost: number | null;
  invoice_number: string | null;
  notes: string | null;
  item_ids: string[]; // schedule items this service completed
}
