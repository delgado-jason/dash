import api from "./api";
import type { Load } from "@/types/load";
import type { CreateLoadInput } from "@/types/LoadInput";

export const createLoad = async (data: CreateLoadInput): Promise<Load> => {
  try {
    const response = await api.post("/loads", data);
    return response.data.load;
  } catch {
    throw new Error("Unable to create load");
  }
};
