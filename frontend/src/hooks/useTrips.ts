import { useState, useEffect } from "react";

import type { Trip } from "@/types/trip";
import getTrips from "@/services/tripsService";

const useTrips = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const result = await getTrips();
        setTrips(result);
        setError("");
      } catch (err) {
        setError("Failed to load trips");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrips();
  }, []);

  return {
    trips,
    isLoading,
    error,
  };
};

export default useTrips;
