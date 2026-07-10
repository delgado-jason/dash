export interface FuelEntry {
  fuel_entry_id: string;
  truck_id: string;
  trip_id: string | null;
  fuel_date: string; // 'YYYY-MM-DD'
  gallons: number;
  price_per_gallon: number;
  odometer_reading: number;
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
  company_name?: string | null;
  fuel_city?: string | null;
  fuel_state: string;
}
