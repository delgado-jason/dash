import api from "./api";
import { AxiosError } from "axios";
import type { Agency } from "@/types/agency";
import type { CreateAgencyInput } from "@/types/createAgencyInput";

export const createAgency = async (
  data: CreateAgencyInput,
): Promise<Agency> => {
  try {
    const response = await api.post("/agencies", data);
    return response.data.agency;
  } catch (error) {
    // Surface the backend's own sentence AND its details — same shape as
    // patchAgentService. Without this the 409 "That agency code is already on
    // file." and every 400 reason arrived at ProspectSheet / CallScreen /
    // LoadForm as the useless "Unable to create new agency".
    if (error instanceof AxiosError && error.response?.data) {
      const body = error.response.data as { error?: string; details?: string[] };
      const detail =
        Array.isArray(body.details) && body.details.length
          ? ` — ${body.details.join("; ")}`
          : "";
      if (body.error) throw new Error(`${body.error}${detail}`);
    }
    throw new Error("Unable to create new agency");
  }
};
