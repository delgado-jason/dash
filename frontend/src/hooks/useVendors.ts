import { useState, useEffect } from "react";
import type { Vendor } from "@/types/vendor";
import { getVendors } from "@/services/vendorsService";

export const useVendors = (refreshKey: number = 0) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const data = await getVendors();
        setVendors(data);
      } catch {
        setError("Failed to load vendors");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVendors();
  }, [refreshKey]);

  return {
    vendors,
    isLoading,
    error,
  };
};
