import api from "./api";
import type { PerDiemRate, PerDiemRateInput } from "@/types/perDiemRate";

// Postgres numeric arrives as a string; the date as "YYYY-MM-DD" (the server
// formats it — never a timestamp that could shift a day).
const coerce = (r: Record<string, unknown>): PerDiemRate => ({
  rate_id: String(r.rate_id),
  effective_from: String(r.effective_from).slice(0, 10),
  rate: Number(r.rate),
  note: (r.note as string | null) ?? null,
});

// Every rate the account has, newest start first (the order the Settings table shows).
export const getPerDiemRates = async (): Promise<PerDiemRate[]> => {
  const res = await api.get("/per-diem/rates");
  const rows: Record<string, unknown>[] = res.data.rates ?? [];
  return rows.map(coerce);
};

export const createPerDiemRate = async (input: PerDiemRateInput): Promise<PerDiemRate> => {
  const res = await api.post("/per-diem/rates", input);
  return coerce(res.data.rate);
};

export const updatePerDiemRate = async (
  rate_id: string,
  patch: Partial<PerDiemRateInput>,
): Promise<PerDiemRate> => {
  const res = await api.patch(`/per-diem/rates/${rate_id}`, patch);
  return coerce(res.data.rate);
};

export const deletePerDiemRate = async (rate_id: string): Promise<void> => {
  await api.delete(`/per-diem/rates/${rate_id}`);
};
