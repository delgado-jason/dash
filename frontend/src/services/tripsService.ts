import axios from "axios";
import api from "./api";
import type { Trip } from "@/types/trip";
import type { TripInput } from "@/types/tripInput";

export const getTrips = async (): Promise<Trip[]> => {
  try {
    const response = await api.get("/trips");
    return response.data.trips;
  } catch {
    throw new Error("Unable to fetch trips");
  }
};

export const createTrip = async (data: TripInput): Promise<Trip> => {
  try {
    const response = await api.post("/trips", data);
    return response.data.trip;
  } catch (err) {
    // Surface the backend's validation message when there is one, so the form
    // can show "Missing trip_purpose" etc. instead of a generic failure.
    if (axios.isAxiosError(err) && err.response?.data?.error) {
      throw new Error(err.response.data.error);
    }
    throw new Error("Unable to create trip");
  }
};

// Truck's latest recorded odometer (max odometer_end across loads + trips).
// Returns null for a brand-new account with no readings yet.
export const getLatestOdometer = async (): Promise<number | null> => {
  try {
    const response = await api.get("/trips/latest-odometer");
    return response.data.latest_odometer;
  } catch {
    throw new Error("Unable to fetch latest odometer");
  }
};
