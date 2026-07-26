export interface Trip {
  trip_id: string;
  trip_number: number;
  trip_purpose: "repositioning" | "home" | "shop" | "personal";
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
  // Where the truck started and ended this trip. Null when not recorded; the
  // end feeds the truck's last-known location.
  start_city: string | null;
  start_state: string | null;
  end_city: string | null;
  end_state: string | null;
  created_at: string;
  updated_at: string;
}
