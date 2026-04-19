import api from "./api";
import type { Load } from "@/types/load";

export const getLoads = async (): Promise<Load[]> => {
  try {
    const response = await api.get("/loads");
    return response.data.loads;
  } catch {
    throw new Error("Unable to fetch loads");
  }
};
