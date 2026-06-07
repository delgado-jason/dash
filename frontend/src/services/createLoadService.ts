import api from "./api";
import type { Load } from "@/types/load";
import type { LoadInput } from "@/types/LoadInput";

export const createLoad = async (data: LoadInput): Promise<Load> => {
  try {
    const response = await api.post("/loads", data);
    return response.data.load;
  } catch {
    throw new Error("Unable to create load");
  }
};
