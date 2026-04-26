import api from "./api";
import type { Broker } from "@/types/broker";
import type { CreateBrokerInput } from "@/types/createBrokerInput";

export const createBroker = async (
  data: CreateBrokerInput,
): Promise<Broker> => {
  try {
    const response = await api.post("/brokers", data);
    return response.data.broker;
  } catch {
    throw new Error("Unable to create new broker");
  }
};
