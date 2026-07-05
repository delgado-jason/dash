export interface Trip {
  trip_id: string;
  trip_number: number;
  truck_id: string | null;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  trip_type: "revenue" | "deadhead";
  trip_source: "user" | "system";
  trip_date: string;
  status: "planned" | "active" | "completed" | "cancelled";
  odometer_start: number | null;
  odometer_end: number | null;
  is_estimated: boolean;
  created_at: string;
  updated_at: string;
}
