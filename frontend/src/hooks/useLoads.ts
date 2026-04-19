import { useState, useEffect } from "react";
import type { Load } from "@/types/load";
import { getLoads } from "@/services/loadsService";

export const useLoads = () => {
  const [loads, setLoads] = useState<Load[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const data = await getLoads();
        setLoads(data);
      } catch {
        setError("Failed to load loads");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLoads();
  }, []);

  return {
    loads,
    isLoading,
    error,
  };
};
