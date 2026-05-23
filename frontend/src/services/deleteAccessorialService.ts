import api from "./api";
import type { Accessorial } from "@/types/accessorial";

export const deleteAccessorial = async (
  accessorial_id: string,
): Promise<Accessorial> => {
  try {
    const response = await api.delete(`/accessorials/${accessorial_id}`);
    return response.data.accessorial;
  } catch {
    throw new Error("Unable to delete accessorial");
  }
};
