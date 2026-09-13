import api from "./api";
import type {
  FuelEntry,
  FuelEntryInput,
  NationalDiesel,
} from "@/types/fuelEntry";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Postgres numerics arrive as strings — coerce the money/volume fields.
const coerce = (f: any): FuelEntry => ({
  ...f,
  gallons: Number(f.gallons),
  price_per_gallon: Number(f.price_per_gallon),
  odometer_reading: Number(f.odometer_reading),
  // Optional: an integer column, but a missing reading must stay null — a
  // Number(null) of 0 would be a meter reading nobody took.
  apu_hours: f.apu_hours == null ? null : Number(f.apu_hours),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export const getFuelEntries = async (): Promise<FuelEntry[]> => {
  const res = await api.get("/fuel");
  return res.data.fuel_entries.map(coerce);
};

export const createFuelEntry = async (
  data: FuelEntryInput,
): Promise<FuelEntry> => {
  const res = await api.post("/fuel", data);
  return coerce(res.data.fuel_entry);
};

export const updateFuelEntry = async (
  id: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await api.patch(`/fuel-entries/${id}`, data);
};

export const deleteFuelEntry = async (id: string): Promise<void> => {
  await api.delete(`/fuel/${id}`);
};

// National retail diesel price (weekly, from EIA via our backend proxy).
export const getNationalDiesel = async (): Promise<NationalDiesel | null> => {
  const res = await api.get("/fuel/national-diesel");
  return res.data.diesel ?? null;
};

export interface NationalDieselMonth {
  month: string; // 'YYYY-MM'
  value: number; // $/gal
}

// Monthly national-diesel history for the you-vs-national chart.
export const getNationalDieselSeries = async (): Promise<
  NationalDieselMonth[]
> => {
  const res = await api.get("/fuel/national-diesel-series");
  return res.data.series ?? [];
};
