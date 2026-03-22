import api from "./api";
import type { Trip } from "@/types/trip";

const getTrips = async () => {
  try {
    const response = await api.get("/trips");
    const tripsData: Trip[] = [];

    for (const trip of response.data.trips) {
      tripsData.push({
        trip_id: trip.trip_id,
        trip_number: trip.trip_number,
        truck_id: trip.truck_id,
        unit_number: trip.unit_number,
        driver_id: trip.driver_id,
        driver_name: trip.driver_name,
        trip_date: new Date(trip.trip_date).toDateString(),
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
