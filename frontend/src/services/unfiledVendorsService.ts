import api from "./api";
import type { UnfiledShop } from "@/types/unfiledShop";

export const getUnfiledVendors = async (): Promise<UnfiledShop[]> => {
  try {
    const response = await api.get("/vendors/unfiled");
    return response.data.unfiled;
  } catch {
    throw new Error("Unable to fetch unfiled maintenance vendors");
  }
};
