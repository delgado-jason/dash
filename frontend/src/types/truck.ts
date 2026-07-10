export interface Truck {
  truck_id: string;
  unit_number: string;
  vin: string | null;
  plate_number: string | null;
  plate_state: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  current_odometer: number;
  status: string; // active | maintenance | out_of_service | inactive
  in_service_date: string | null;
  avatar_url: string | null;
}
