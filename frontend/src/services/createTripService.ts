import api from "./api";
import type { Trip } from "@/types/trip";
import type { TripInput } from "@/types/tripInput";

export const createTrip = async (data: TripInput): Promise<Trip> => {
  try {
    const response = await api.post("/trips", data);
    return response.data.trip;
  } catch {
    throw new Error("Unable to create trip");
  }
};
