import api from "./api";
import type { SettlementSplit, SettlementSplitInput } from "@/types/settlementSplit";

// Postgres numeric arrives as a string; the date as "YYYY-MM-DD" (the server
// formats it — never a timestamp that could shift a day).
const coerce = (r: Record<string, unknown>): SettlementSplit => ({
  split_id: String(r.split_id),
  effective_from: String(r.effective_from).slice(0, 10),
  linehaul_pct: Number(r.linehaul_pct),
  trailer_pct: Number(r.trailer_pct),
  fuel_surcharge_pct: Number(r.fuel_surcharge_pct),
  accessorial_pct: Number(r.accessorial_pct),
  note: (r.note as string | null) ?? null,
});

// Every split the account has, newest start first (the order the Settings table shows).
export const getSettlementSplits = async (): Promise<SettlementSplit[]> => {
  const res = await api.get("/settlement-splits");
  const rows: Record<string, unknown>[] = res.data.splits ?? [];
  return rows.map(coerce);
};

// Start a new schedule from a date.
export const createSettlementSplit = async (input: SettlementSplitInput): Promise<SettlementSplit> => {
  const res = await api.post("/settlement-splits", input);
  return coerce(res.data.split);
};

// Edit a row in place — a typo fix never forks history.
export const updateSettlementSplit = async (
  split_id: string,
  patch: Partial<SettlementSplitInput>,
): Promise<SettlementSplit> => {
  const res = await api.patch(`/settlement-splits/${split_id}`, patch);
  return coerce(res.data.split);
};

export const deleteSettlementSplit = async (split_id: string): Promise<void> => {
  await api.delete(`/settlement-splits/${split_id}`);
};
