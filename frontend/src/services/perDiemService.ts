import api from "./api";
import type { PerDiemDay, PerDiemStatus } from "@/types/perDiem";

export const getPerDiemDays = async (year: number): Promise<PerDiemDay[]> => {
  const res = await api.get(`/per-diem?year=${year}`);
  return res.data.days;
};

export const setPerDiemDay = async (
  day: string,
  status: PerDiemStatus,
): Promise<PerDiemDay> => {
  const res = await api.put("/per-diem", { day, status });
  return res.data.day;
};

export const clearPerDiemDay = async (day: string): Promise<void> => {
  await api.delete(`/per-diem/${day}`);
};

// Most recent home day on/before today, or null when nothing's marked.
export const getLastHomeDay = async (): Promise<string | null> => {
  const res = await api.get("/per-diem/last-home");
  return res.data.last_home ?? null;
};
