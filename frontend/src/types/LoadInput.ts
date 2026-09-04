export interface LoadInput {
  // Attribution (relationship system): required on NEW loads by the form.
  booked_via?: "agent_reached_out" | "i_reached_out" | null;
  load_number: string;
  broker_id: string;
  agent_id: string;
  load_type: string;
  load_status: string;
  pickup_date: string;
  delivery_date?: string | null;
  origin_city: string;
  origin_state: string;
  origin_market_id: string;
  destination_city: string;
  destination_state: string;
  destination_market_id: string;
  commodity?: string | null;
  weight?: number | null;
  length_in?: number | null;
  width_in?: number | null;
  height_in?: number | null;
  shipper_name?: string | null;
  shipper_facility_id?: string | null;
  shipper_in?: string | null;
  shipper_out?: string | null;
  pickup_appt_start?: string | null;
  pickup_appt_end?: string | null;
  receiver_name?: string | null;
  receiver_facility_id?: string | null;
  receiver_in?: string | null;
  receiver_out?: string | null;
  delivery_appt_start?: string | null;
  delivery_appt_end?: string | null;
  linehaul: number;
  fuel_surcharge: number;
  deadhead_miles?: number | null;
  loaded_miles?: number | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
  payment_status: string;
  truck_id?: string | null;
  driver_id?: string | null;
  trailer_id?: string | null;
  // Who gets booking credit — a user's self_id. Defaults to the creator
  // server-side; the owner may set it to credit a dispatcher.
  booked_by?: string | null;
}
