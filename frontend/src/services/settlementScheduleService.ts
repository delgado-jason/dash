import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import api from "./api";
import type { SettlementSchedule } from "@/types/settlementSchedule";

const dayInWeek = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : fallback;
};

const coerce = (s: Record<string, unknown>): SettlementSchedule => ({
  carrier_name: (s.carrier_name as string | null) ?? null,
  detention_free_hours:
    s.detention_free_hours != null ? Number(s.detention_free_hours) : DEFAULT_DETENTION_FREE_HOURS,
  per_diem_deduct_pct:
    s.per_diem_deduct_pct != null ? Number(s.per_diem_deduct_pct) : 0.8,
  hometime_threshold_days:
    s.hometime_threshold_days != null
      ? Number(s.hometime_threshold_days)
      : 42,
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
  // No fallback figure: absent means "no commitment", and the rate basis is
  // meant to fall back to measured miles rather than to a number nobody chose.
  target_miles_per_month:
    s.target_miles_per_month != null ? Number(s.target_miles_per_month) : null,
  // Equipment & permits (migration 110). Two of the three are Postgres
  // `numeric`, which arrives over JSON as a STRING — coerced here so nothing
  // downstream multiplies "2.00" by a mileage and gets a concatenation. Null
  // stays null in all three: no invented tare, no invented permit cost.
  empty_weight_lb:
    s.empty_weight_lb != null ? Number(s.empty_weight_lb) : null,
  permit_cost_usd:
    s.permit_cost_usd != null ? Number(s.permit_cost_usd) : null,
  escort_cost_per_loaded_mile:
    s.escort_cost_per_loaded_mile != null
      ? Number(s.escort_cost_per_loaded_mile)
      : null,
  // A weekday is 0–6 and a lag is 0–6 days; anything else (a bad column, NaN)
  // would spin the cash board's statement walk — the house defaults instead.
  settlement_day: dayInWeek(s.settlement_day, 3),
  deposit_lag_days: dayInWeek(s.deposit_lag_days, 1),
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
