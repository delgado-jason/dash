export interface TripInput {
  truck_id?: string;
  driver_id?: string;
  trip_date: string;
  trip_purpose: "repositioning" | "home" | "shop" | "personal";
  odometer_start?: number;
  odometer_end?: number;
  is_estimated?: boolean;
  start_city?: string;
  start_state?: string;
  end_city?: string;
  end_state?: string;
}
