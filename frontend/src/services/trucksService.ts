import api from "./api";
import type { Truck } from "@/types/truck";

export const getTrucks = async (): Promise<Truck[]> => {
  const res = await api.get("/trucks/me");
  return res.data.trucks;
};

export const getTruck = async (id: string): Promise<Truck> => {
  const res = await api.get(`/trucks/me/${id}`);
  return res.data.truck;
};

export const createTruck = async (
  data: Record<string, unknown>,
): Promise<Truck> => {
  const res = await api.post("/trucks/me", data);
  return res.data.truck;
};

export const patchTruck = async (
  id: string,
  data: Record<string, unknown>,
): Promise<Truck> => {
  const res = await api.patch(`/trucks/me/${id}`, data);
  return res.data.truck;
};
