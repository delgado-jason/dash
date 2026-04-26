import api from "./api";
import type { Market } from "@/types/market";
import type { CreateMarketInput } from "@/types/createMarketInput";

export const createMarket = async (
  data: CreateMarketInput,
): Promise<Market> => {
  try {
    const response = await api.post("/markets", data);
    return response.data.market;
  } catch {
    throw new Error("Unable to create new market");
  }
};
