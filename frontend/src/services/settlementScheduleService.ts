import api from "./api";
import type { SettlementSchedule } from "@/types/settlementSchedule";

const coerce = (s: Record<string, unknown>): SettlementSchedule => ({
  linehaul_pct: Number(s.linehaul_pct),
  trailer_pct: Number(s.trailer_pct),
  fuel_surcharge_pct: Number(s.fuel_surcharge_pct),
  accessorial_pct: Number(s.accessorial_pct),
  carrier_name: (s.carrier_name as string | null) ?? null,
  detention_free_hours:
    s.detention_free_hours != null ? Number(s.detention_free_hours) : 3,
  per_diem_rate: s.per_diem_rate != null ? Number(s.per_diem_rate) : 69,
  per_diem_deduct_pct:
    s.per_diem_deduct_pct != null ? Number(s.per_diem_deduct_pct) : 0.8,
  hometime_threshold_days:
    s.hometime_threshold_days != null
      ? Number(s.hometime_threshold_days)
      : 21,
  operation: (s.operation as string) ?? "flatbed",
  rate_tier_std_min:
    s.rate_tier_std_min != null ? Number(s.rate_tier_std_min) : 0.1,
  rate_tier_std_target:
    s.rate_tier_std_target != null ? Number(s.rate_tier_std_target) : 0.2,
  rate_tier_std_strong:
    s.rate_tier_std_strong != null ? Number(s.rate_tier_std_strong) : 0.3,
  rate_tier_spec_min:
    s.rate_tier_spec_min != null ? Number(s.rate_tier_spec_min) : 0.35,
  rate_tier_spec_target:
    s.rate_tier_spec_target != null ? Number(s.rate_tier_spec_target) : 0.45,
  rate_tier_spec_strong:
    s.rate_tier_spec_strong != null ? Number(s.rate_tier_spec_strong) : 0.6,
  margin_goal: s.margin_goal != null ? Number(s.margin_goal) : 0.26,
  settlement_day: s.settlement_day != null ? Number(s.settlement_day) : 3,
});

export const getSettlementSchedule = async (): Promise<SettlementSchedule> => {
  const res = await api.get("/settlement-schedule");
  return coerce(res.data.schedule);
};

export const updateSettlementSchedule = async (
  data: Partial<SettlementSchedule>,
): Promise<SettlementSchedule> => {
  const res = await api.put("/settlement-schedule", data);
  return coerce(res.data.schedule);
};
