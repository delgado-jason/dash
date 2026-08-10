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

export interface LastKnownLocation {
  city: string | null;
  state: string | null;
}

// Where the truck currently sits, derived from the latest located record
// (delivered load, fuel stop, or trip). Prefills a new trip's start location.
// Non-fatal: a failure just leaves the field blank, so it swallows errors and
// returns null rather than throwing.
export const getLastKnownLocation =
  async (): Promise<LastKnownLocation | null> => {
    try {
      const response = await api.get("/trips/last-known-location");
      return response.data.location ?? null;
    } catch {
      return null;
    }
  };

// ---- EDIT (S11) ----

export const updateTrip = async (
  trip_id: string,
  data: Partial<TripInput>,
): Promise<Trip> => {
  try {
    const res = await api.patch(`/trips/${trip_id}`, data);
    return res.data.trip;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data?.error) {
      throw new Error(err.response.data.error);
    }
    throw new Error("Unable to update trip");
  }
};

export const deleteTrip = async (trip_id: string): Promise<void> => {
  try {
    await api.delete(`/trips/${trip_id}`);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data?.error) {
      throw new Error(err.response.data.error);
    }
    throw new Error("Unable to delete trip");
  }
};
