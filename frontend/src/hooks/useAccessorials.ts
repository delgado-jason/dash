import { useState, useEffect } from "react";
import type { Accessorial } from "@/types/accessorial";
import { getAccessorials } from "@/services/accessorialService";
import { useParams } from "react-router";

export const useAccessorials = (refreshKey: number) => {
  const [accessorials, setAccessorials] = useState<Accessorial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { load_id } = useParams();

  useEffect(() => {
    const fetchLoad = async () => {
      try {
        if (!load_id) return;
        const data = await getAccessorials(load_id);
        setAccessorials(data);
      } catch {
        setError("Failed to retrieve the accessorials");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLoad();
  }, [refreshKey, load_id]);

  return {
    accessorials,
    isLoading,
    error,
  };
};
