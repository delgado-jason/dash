import api from "./api";
import type { FscBand, FscSchedule, FscScheduleInput } from "@/types/fscSchedule";

// JSONB comes back as JSON; numerics inside it are already numbers, but a band
// typed by hand could arrive as strings — coerce every field once, here.
const band = (b: Record<string, unknown>): FscBand => ({
  low: Number(b.low),
  high: b.high == null ? null : Number(b.high),
  cpm: Number(b.cpm),
});

const coerce = (r: Record<string, unknown>): FscSchedule => ({
  schedule_id: String(r.schedule_id),
  effective_from: String(r.effective_from).slice(0, 10),
  bands: Array.isArray(r.bands) ? (r.bands as Record<string, unknown>[]).map(band) : [],
  note: (r.note as string | null) ?? null,
  created_at: String(r.created_at ?? ""),
});

// Every pasted table, newest start first.
export const getFscSchedules = async (): Promise<FscSchedule[]> => {
  const res = await api.get("/fuel/fsc-schedules");
  const rows: Record<string, unknown>[] = res.data.schedules ?? [];
  return rows.map(coerce);
};

export const createFscSchedule = async (input: FscScheduleInput): Promise<FscSchedule> => {
  const res = await api.post("/fuel/fsc-schedules", input);
  return coerce(res.data.schedule);
};

export const deleteFscSchedule = async (schedule_id: string): Promise<void> => {
  await api.delete(`/fuel/fsc-schedules/${schedule_id}`);
};
