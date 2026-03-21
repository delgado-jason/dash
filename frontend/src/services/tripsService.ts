import api from "./api";
import type { Trip } from "@/types/trip";

const getTrips = async () => {
  try {
    const response = await api.get("/trips");
    const tripsData: Trip[] = [];

    for (const trip of response.data.trips) {
      tripsData.push({
        trip_id: trip.trip_id,
        truck_id: trip.truck_id,
        driver_id: trip.driver_id,
        trip_date: trip.trip_date,
        trip_status: trip.status,
        odometer_start: trip.odometer_start,
        odometer_end: trip.odometer_end,
      });
    }

    return tripsData;
  } catch (err) {
    throw new Error("Unable to fetch trips");
  }
};

export default getTrips;
