import api from "./api";
import type { PerDiemDay, PerDiemStatus } from "@/types/perDiem";

export const getPerDiemDays = async (year: number): Promise<PerDiemDay[]> => {
  const res = await api.get(`/per-diem?year=${year}`);
  return res.data.days;
};

export const setPerDiemDay = async (
  day: string,
  status: PerDiemStatus,
  planned = false,
): Promise<PerDiemDay> => {
  const res = await api.put("/per-diem", { day, status, planned });
  return res.data.day;
};

export const clearPerDiemDay = async (day: string): Promise<void> => {
  await api.delete(`/per-diem/${day}`);
};

// The home days still AHEAD ("YYYY-MM-DD") — what the cash board forecasts
// against (migration 107). Separate from getHomeDays, which is history: a plan
// must never reach the utilization window or the per-diem deduction.
export const getPlannedHomeDays = async (): Promise<string[]> => {
  const res = await api.get("/per-diem/planned");
  return res.data.days ?? [];
};

// All home days ("YYYY-MM-DD") that HAPPENED, for the truck utilization week breakdown.
export const getHomeDays = async (): Promise<string[]> => {
  const res = await api.get("/per-diem/home-days");
  return res.data.days ?? [];
};
