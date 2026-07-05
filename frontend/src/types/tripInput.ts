export interface TripInput {
  truck_id?: string;
  driver_id?: string;
  trip_date: string;
  odometer_start?: number;
  odometer_end?: number;
  is_estimated?: boolean;
}
