import api from "./api";
import type { Market } from "@/types/market";

export const getMarkets = async (): Promise<Market[]> => {
  try {
    const response = await api.get("/markets");
    return response.data.markets;
  } catch {
    throw new Error("Unable to fetch markets");
  }
};
