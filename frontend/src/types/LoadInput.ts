export interface LoadInput {
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
  dimensions?: string | null;
  shipper_name?: string | null;
  receiver_name?: string | null;
  linehaul: number;
  fuel_surcharge: number;
  deadhead_miles?: number | null;
  loaded_miles?: number | null;
  odometer_start?: number | null;
  payment_status: string;
}
