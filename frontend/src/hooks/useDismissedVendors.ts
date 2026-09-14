import { useState, useEffect } from "react";
import type { DismissedShop } from "@/types/dismissedShop";
import { getDismissedVendors } from "@/services/dismissedVendorsService";

// Silent on failure, like useUnfiledVendors: the DISMISSED fold is an assist,
// not page data — if it can't load, the rolodex still renders.
export const useDismissedVendors = (refreshKey: number = 0) => {
  const [dismissed, setDismissed] = useState<DismissedShop[]>([]);

  useEffect(() => {
    const fetchDismissed = async () => {
      try {
        setDismissed(await getDismissedVendors());
      } catch {
        setDismissed([]);
      }
    };

    fetchDismissed();
  }, [refreshKey]);

  return { dismissed };
};
