import api from "./api";
import type { FuelEntry, FuelEntryInput } from "@/types/fuelEntry";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Postgres numerics arrive as strings — coerce the money/volume fields.
const coerce = (f: any): FuelEntry => ({
  ...f,
  gallons: Number(f.gallons),
  price_per_gallon: Number(f.price_per_gallon),
  odometer_reading: Number(f.odometer_reading),
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

export const deleteFuelEntry = async (id: string): Promise<void> => {
  await api.delete(`/fuel/${id}`);
};
