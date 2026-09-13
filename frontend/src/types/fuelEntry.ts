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
  company_name?: string | null;
  fuel_city?: string | null;
  fuel_state: string;
}
