import { useState, useEffect } from "react";
import type { UnfiledShop } from "@/types/unfiledShop";
import { getUnfiledVendors } from "@/services/unfiledVendorsService";

// Silent on failure by design: the unfiled section is an assist, not page
// data — if it can't load, the rolodex still renders.
export const useUnfiledVendors = (refreshKey: number = 0) => {
  const [unfiled, setUnfiled] = useState<UnfiledShop[]>([]);

  useEffect(() => {
    const fetchUnfiled = async () => {
      try {
        setUnfiled(await getUnfiledVendors());
      } catch {
        setUnfiled([]);
      }
    };

    fetchUnfiled();
  }, [refreshKey]);

  return { unfiled };
};
