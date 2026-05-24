import api from "./api";
import type { Accessorial } from "@/types/accessorial";

interface PatchAccessorialInput {
  accessorial_type: string;
  amount: number;
}

export const patchAccessorial = async (
  accessorial_id: string,
  data: PatchAccessorialInput,
): Promise<Accessorial> => {
  try {
    const response = await api.patch(`/accessorials/${accessorial_id}`, data);
    return response.data.accessorial;
  } catch {
    throw new Error("Unable to patch accessorial");
  }
};
