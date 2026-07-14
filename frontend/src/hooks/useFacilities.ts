import { useState, useEffect } from "react";
import type { FacilityRow } from "@/types/facility";
import { getFacilities } from "@/services/facilitiesService";

export const useFacilities = (refreshKey: number = 0) => {
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFacilities()
      .then(setFacilities)
      .catch(() => setError("Failed to load facilities"))
      .finally(() => setIsLoading(false));
  }, [refreshKey]);

  return { facilities, isLoading, error };
};
