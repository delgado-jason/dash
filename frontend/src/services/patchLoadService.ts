import api from "./api";
import type { Load } from "@/types/load";

interface PatchLoadInput {
  load_status?: string;
  payment_status?: string;
  booked_by?: string | null;
  detention_paid?: boolean;
  tonu_paid?: boolean;
  detention_billable?: boolean | null;
}

export const patchLoad = async (
  load_id: string,
  data: PatchLoadInput,
): Promise<Load> => {
  try {
    const response = await api.patch(`/loads/${load_id}`, data);
    return response.data.load;
  } catch {
    throw new Error("Unable to patch load");
  }
};
