import api from "./api";
import type { Agency } from "@/types/agency";

export const getAgencies = async (): Promise<Agency[]> => {
  try {
    const response = await api.get("/agencies");
    return response.data.agencies;
  } catch {
    throw new Error("Unable to fetch agencies");
  }
};
