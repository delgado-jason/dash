import { useState, useEffect } from "react";
import type { Trip } from "@/types/trip";
import { getTrips } from "@/services/tripsService";

export const useTrips = (refreshKey: number) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrips = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getTrips();
        setTrips(data);
      } catch {
        setError("Failed to load trips");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrips();
  }, [refreshKey]);

  return {
    trips,
    isLoading,
    error,
  };
};
