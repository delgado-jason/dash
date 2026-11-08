import api from "./api";
import { loadSaveErrorFrom } from "@/lib/loads/loadSaveError";
import type { Load } from "@/types/load";
import type { LoadInput } from "@/types/LoadInput";

export const createLoad = async (data: LoadInput): Promise<Load> => {
  try {
    const response = await api.post("/loads", data);
    return response.data.load;
  } catch (error) {
    const refused = loadSaveErrorFrom(error);
    if (refused) throw refused;
    throw new Error("Unable to create load");
  }
};
