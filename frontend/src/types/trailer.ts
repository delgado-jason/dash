export interface Trailer {
  trailer_id: string;
  unit_number: string;
  vin: string | null;
  plate_number: string | null;
  plate_state: string | null;
  trailer_type: string;
  length_ft: number | null;
  make: string | null;
  model: string | null;
  year: number | null;
  current_hub: number;
  status: string;
  avatar_url: string | null;
  in_service_date: string | null;
  notes: string | null;
}
