// Four units (078). Each reads its OWN meter: the tractor an odometer, the
// trailer a hubodometer, the APU an hour meter. A schedule item belongs to one
// unit; a service (shop visit) can cover the truck and trailer together.
export type MaintenanceUnit = "tractor" | "trailer" | "apu";
export type ServiceUnit = "tractor" | "trailer" | "both" | "apu";

export interface MaintenanceItem {
  item_id: string;
  unit: MaintenanceUnit;
  name: string;
  category: string;
  interval_miles: number | null;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_miles: number | null;
  last_done_hours: number | null; // the APU hour meter at the last completion
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
  unit: ServiceUnit;
  service_date: string; // 'YYYY-MM-DD'
  odometer: number | null; // truck reading (tractor / both)
  trailer_hub: number | null; // trailer reading (trailer / both)
  apu_hours: number | null; // APU hour meter at the visit (apu)
  vendor: string | null;
  location: string | null;
  description: string;
  cost: number | null;
  invoice_number: string | null;
  notes: string | null;
  item_ids: string[]; // schedule items this service completed
}
