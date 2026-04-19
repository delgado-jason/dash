import { useState, useEffect } from "react";
import type { Broker } from "@/types/broker";
import { getBrokers } from "@/services/brokersService";

export const useBrokers = () => {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrokers = async () => {
      try {
        const data = await getBrokers();
        setBrokers(data);
      } catch {
        setError("Failed to load brokers");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrokers();
  }, []);

  return {
    brokers,
    isLoading,
    error,
  };
};
