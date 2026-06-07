import api from "./api";
import type { Load } from "@/types/load";

export const deleteLoad = async (load_id: string): Promise<Load> => {
  try {
    const response = await api.delete(`/loads/${load_id}`);
    return response.data.load;
  } catch {
    throw new Error("Unable to delete load");
  }
};
