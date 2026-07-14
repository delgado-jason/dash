import api from "./api";
import type { Facility, FacilityRow } from "@/types/facility";

export const getFacilities = async (): Promise<FacilityRow[]> => {
  const res = await api.get("/facilities");
  return res.data.facilities;
};

export const getFacility = async (id: string): Promise<Facility> => {
  const res = await api.get(`/facilities/${id}`);
  return res.data.facility;
};

export const createFacility = async (
  data: Record<string, unknown>,
): Promise<Facility> => {
  const res = await api.post("/facilities", data);
  return res.data.facility;
};

export const patchFacility = async (
  id: string,
  data: Record<string, unknown>,
): Promise<Facility> => {
  const res = await api.patch(`/facilities/${id}`, data);
  return res.data.facility;
};
