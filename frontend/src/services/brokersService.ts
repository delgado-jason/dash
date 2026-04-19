import api from "./api";
import type { Broker } from "@/types/broker";

export const getBrokers = async (): Promise<Broker[]> => {
  try {
    const response = await api.get("/brokers");
    return response.data.brokers;
  } catch {
    throw new Error("Unable to fetch brokers");
  }
};
