export interface FuelEntry {
  fuel_entry_id: string;
  truck_id: string;
  trip_id: string | null;
  fuel_date: string; // 'YYYY-MM-DD'
  gallons: number;
  price_per_gallon: number;
  odometer_reading: number;
  // Optional APU hour-meter reading taken at the pump — it re-anchors the APU
  // projection. null means it wasn't read, which is not the same as zero.
  apu_hours: number | null;
  // GL-154 (2026-11-05): his word on whether the tank was filled to the top —
  // only a ticked fill closes a tank window. Ticked by default on the form;
  // history was backfilled by the old 120-gallon rule (migration 093).
  filled_to_top: boolean;
  company_name: string | null;
  fuel_city: string | null;
  fuel_state: string;
  created_at: string;
  updated_at: string;
}

export interface NationalDiesel {
  value: number; // $/gal
  period: string; // 'YYYY-MM-DD' — the week the price is for
  units: string;
  seriesDescription: string | null;
}

export interface FuelEntryInput {
  truck_id: string;
  fuel_date: string;
  gallons: number;
  price_per_gallon: number;
  odometer_reading: number;
  apu_hours?: number | null;
  filled_to_top?: boolean; // the form always sends it; absent lets the column default (true) stand
  company_name?: string | null;
  fuel_city?: string | null;
  fuel_state: string;
}
