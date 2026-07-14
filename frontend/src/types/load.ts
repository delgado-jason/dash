export interface Load {
  load_id: string;
  load_number: string;
  load_type: string;
  load_status: string;
  broker_id: string;
  broker: string;
  agent_id: string;
  agent: string;
  agent_email: string | null;
  shipper_name?: string | null;
  shipper_facility_id?: string | null;
  // Stop times as bare "HH:MM:SS" (Postgres `time`), paired with pickup/delivery
  // date. Null when not recorded.
  shipper_in?: string | null;
  shipper_out?: string | null;
  pickup_date: string;
  origin_market_id: string;
  origin_city: string;
  origin_state: string;
  origin_market: string;
  receiver_name?: string | null;
  receiver_facility_id?: string | null;
  receiver_in?: string | null;
  receiver_out?: string | null;
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
  dimensions?: string | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
  payment_status: string;
  truck_id?: string | null;
  driver_id?: string | null;
  trailer_id?: string | null;
  // Joined labels, present on the single-load fetch (getLoad) only.
  truck_unit?: string | null;
  driver_name?: string | null;
  trailer_unit?: string | null;
  created_at: string;
  updated_at: string;
}
