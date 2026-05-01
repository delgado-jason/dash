import { useState, useEffect } from "react";
import type { Load } from "@/types/load";
import { getLoad } from "@/services/loadService";
import { useParams } from "react-router";

export const useLoad = (refreshKey: number) => {
  const [load, setLoad] = useState<Load | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { load_id } = useParams();

  useEffect(() => {
    const fetchLoad = async () => {
      try {
        if (!load_id) return;
        const data = await getLoad(load_id);
        setLoad(data);
      } catch {
        setError("Failed to retrieve the load");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLoad();
  }, [refreshKey, load_id]);

  return {
    load,
    isLoading,
    error,
  };
};
