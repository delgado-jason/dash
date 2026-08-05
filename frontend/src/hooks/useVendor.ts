import { useState, useEffect } from "react";
import type { Vendor } from "@/types/vendor";
import type { VendorRatingHistory } from "@/types/vendorRatingHistory";
import { getVendor } from "@/services/vendorService";
import { useParams } from "react-router";

export const useVendor = (refreshKey: number = 0) => {
  const [vendor, setVendor] = useState<Vendor>();
  const [ratingHistory, setRatingHistory] = useState<VendorRatingHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { vendor_id } = useParams();

  useEffect(() => {
    if (!vendor_id) {
      setError("No vendor specified");
      setIsLoading(false);
      return;
    }

    const fetchVendor = async () => {
      try {
        const data = await getVendor(vendor_id);
        setVendor(data.vendor);
        setRatingHistory(data.ratingHistory);
      } catch {
        setError("Failed to load vendor");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVendor();
  }, [refreshKey, vendor_id]);

  return {
    vendor,
    ratingHistory,
    isLoading,
    error,
  };
};
