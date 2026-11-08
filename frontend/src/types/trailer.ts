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
  // No hubodometer: the trailer's meter is the truck's odometer, by rule (GL-07) —
  // see lib/metrics/trailerMeter.ts. The old current_hub seed was dropped (097).
  status: string;
  avatar_url: string | null;
  in_service_date: string | null;
  notes: string | null;
}
