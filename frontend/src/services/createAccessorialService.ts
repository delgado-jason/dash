import api from "./api";
import type { Accessorial } from "@/types/accessorial";
import type { CreateAccessorialInput } from "@/types/createAccessorialInput";

export const createAccessorial = async (
  load_id: string,
  data: CreateAccessorialInput,
): Promise<Accessorial> => {
  try {
    const response = await api.post(`accessorials/load/${load_id}`, data);
    return response.data.accessorial;
  } catch {
    throw new Error("Unable to create new accessorial");
  }
};
