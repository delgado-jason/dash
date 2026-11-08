import api from "./api";
import type { FscRegionPoint, FscScalePoint, FscScalePointInput } from "@/types/fscScalePoint";

const region = (r: Record<string, unknown>): FscRegionPoint => ({
  region: String(r.region ?? ""),
  price: Number(r.price),
  cpm: Number(r.cpm),
});

// Postgres numerics arrive as strings; the week as "YYYY-MM-DD" (the server
// formats it — never a timestamp that could shift a day).
const coerce = (r: Record<string, unknown>): FscScalePoint => ({
  point_id: String(r.point_id),
  week_of: String(r.week_of).slice(0, 10),
  national_avg: Number(r.national_avg),
  cents_per_mile: Number(r.cents_per_mile),
  pct_of_linehaul: r.pct_of_linehaul == null ? null : Number(r.pct_of_linehaul),
  regions: Array.isArray(r.regions) ? (r.regions as Record<string, unknown>[]).map(region) : [],
  note: (r.note as string | null) ?? null,
});

// Every week on file, newest first.
export const getFscScalePoints = async (): Promise<FscScalePoint[]> => {
  const res = await api.get("/fuel/fsc-points");
  const rows: Record<string, unknown>[] = res.data.points ?? [];
  return rows.map(coerce);
};

export const createFscScalePoint = async (input: FscScalePointInput): Promise<FscScalePoint> => {
  const res = await api.post("/fuel/fsc-points", input);
  return coerce(res.data.point);
};

export const deleteFscScalePoint = async (point_id: string): Promise<void> => {
  await api.delete(`/fuel/fsc-points/${point_id}`);
};
