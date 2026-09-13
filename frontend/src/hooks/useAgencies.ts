import { useState, useEffect } from "react";
import type { Agency } from "@/types/agency";
import { getAgencies } from "@/services/agenciesService";

export const useAgencies = (refreshKey: number = 0) => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        const data = await getAgencies();
        setAgencies(data);
      } catch {
        setError("Failed to load agencies");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgencies();
  }, [refreshKey]);

  return {
    agencies,
    isLoading,
    error,
  };
};
