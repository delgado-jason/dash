import { useState, useEffect } from "react";
import type { Market } from "@/types/market";
import { getMarkets } from "@/services/marketsService";

export const useMarkets = (refreshKey: number = 0) => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        const data = await getMarkets();
        setMarkets(data);
      } catch {
        setError("Failed to load markets");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarkets();
  }, [refreshKey]);

  return {
    markets,
    isLoading,
    error,
  };
};
