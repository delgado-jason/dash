import api from "./api";
import type { Vendor } from "@/types/vendor";

export const getVendors = async (): Promise<Vendor[]> => {
  try {
    const response = await api.get("/vendors");
    return response.data.vendors;
  } catch {
    throw new Error("Unable to fetch vendors");
  }
};
