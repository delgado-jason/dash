export interface Load {
  load_id: string;
  load_number: string;
  load_type: string;
  load_status: string;
  broker_id: string;
  broker: string;
  agent_id: string;
  // Attribution (relationship system): who initiated this booking. Required
  // on NEW loads by the form; legacy nulls sit outside every inbound %.
  booked_via?: "agent_reached_out" | "i_reached_out" | null;
  agent: string;
  agent_email: string | null;
  shipper_name?: string | null;
  shipper_facility_id?: string | null;
  // Stop times as bare "HH:MM:SS" (Postgres `time`), paired with pickup/delivery
  // date. Null when not recorded. *_appt_start + optional *_appt_end are the
  // scheduled appointment (end null) or window (end present).
  shipper_in?: string | null;
  shipper_out?: string | null;
  pickup_appt_start?: string | null;
  pickup_appt_end?: string | null;
  pickup_date: string;
  origin_market_id: string;
  origin_city: string;
  origin_state: string;
  origin_market: string;
  receiver_name?: string | null;
  receiver_facility_id?: string | null;
  receiver_in?: string | null;
  receiver_out?: string | null;
  delivery_appt_start?: string | null;
  delivery_appt_end?: string | null;
  delivery_date?: string | null;
  destination_market_id: string;
  destination_city: string;
  destination_state: string;
  delivery_market: string;
  deadhead_miles: number;
  loaded_miles: number;
  linehaul: string;
  fuel_surcharge: string;
  total_accessorials: string;
  // Full customer rate (gross) and the owner-op's take after the settlement
  // schedule (net = their company gross). Both computed server-side; numeric →
  // string. Optional: absent on locally-built loads / fixtures, where the metrics
  // fall back to the linehaul+FSC+accessorials sum.
  gross_revenue?: string;
  net_revenue?: string;
  // The trailer's slice of net (its % of linehaul + its % of base-rate
  // accessorials). Server-side; numeric → string. Absent → 0 trailer share.
  trailer_net?: string;
  commodity: string | null;
  weight?: number | null;
  // The cargo's own dimensions in whole inches; null on a legal load.
  length_in?: number | null;
  width_in?: number | null;
  height_in?: number | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
  payment_status: string;
  // Detention/TONU fees owed until collected — "owed" is derived, "paid" is the
  // manual mark that clears the flag.
  detention_paid?: boolean;
  // Jason's detention decision: undefined/null = undecided (recommend asking),
  // true = confirmed owed (waiting to collect), false = dismissed (shipper won't pay).
  detention_billable?: boolean | null;
  tonu_paid?: boolean;
  truck_id?: string | null;
  driver_id?: string | null;
  trailer_id?: string | null;
  // The user (self_id) who booked this load — powers the dispatcher card's
  // per-person credit. Defaults to the creator; editable to reassign credit.
  booked_by?: string | null;
  // The booker's resolved display name (users.display_name, else profile
  // first+last, else email), joined on the single-load fetch (getLoad). Read-only.
  booked_by_name?: string | null;
  // Joined labels, present on the single-load fetch (getLoad) only.
  truck_unit?: string | null;
  driver_name?: string | null;
  trailer_unit?: string | null;
  created_at: string;
  updated_at: string;
}
