import api from "./api";
import type { Driver } from "@/types/driver";

export const getDrivers = async (): Promise<Driver[]> => {
  const res = await api.get("/drivers");
  return res.data.drivers;
};

export const getDriver = async (id: string): Promise<Driver> => {
  const res = await api.get(`/drivers/${id}`);
  return res.data.driver;
};

export const createDriver = async (
  data: Record<string, unknown>,
): Promise<Driver> => {
  const res = await api.post("/drivers", data);
  return res.data.driver;
};
