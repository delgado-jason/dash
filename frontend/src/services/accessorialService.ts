import api from "./api";
import type { Accessorial } from "@/types/accessorial";

export const getAccessorials = async (
  load_id: string,
): Promise<Accessorial[]> => {
  try {
    const response = await api.get(`/accessorials/load/${load_id}`);
    return response.data.accessorials;
  } catch {
    throw new Error("Unable to fetch accessorials");
  }
};
