import api from "./api";
import type { SettlementSchedule } from "@/types/settlementSchedule";

const coerce = (s: Record<string, unknown>): SettlementSchedule => ({
  linehaul_pct: Number(s.linehaul_pct),
  trailer_pct: Number(s.trailer_pct),
  fuel_surcharge_pct: Number(s.fuel_surcharge_pct),
  accessorial_pct: Number(s.accessorial_pct),
});

export const getSettlementSchedule = async (): Promise<SettlementSchedule> => {
  const res = await api.get("/settlement-schedule");
  return coerce(res.data.schedule);
};

export const updateSettlementSchedule = async (
  data: SettlementSchedule,
): Promise<SettlementSchedule> => {
  const res = await api.put("/settlement-schedule", data);
  return coerce(res.data.schedule);
};
