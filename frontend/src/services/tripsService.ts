import api from "./api";
import type { Trip } from "@/types/trip";

export const getTrips = async (): Promise<Trip[]> => {
  try {
    const response = await api.get("/trips");
    return response.data.trips;
  } catch {
    throw new Error("Unable to fetch trips");
  }
};
