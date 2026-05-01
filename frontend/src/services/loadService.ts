import api from "./api";
import type { Load } from "@/types/load";

export const getLoad = async (load_id: string): Promise<Load> => {
  try {
    const response = await api.get(`/loads/${load_id}`);
    return response.data.load;
  } catch {
    throw new Error("Unable to fetch load");
  }
};
