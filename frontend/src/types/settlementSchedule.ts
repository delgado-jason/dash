// The carrier pay fractions that turn a load's full customer rate into the
// owner-op's net (their company gross). 0.65 = 65%. Coerced to numbers in the
// service so the UI works in plain fractions.
export interface SettlementSchedule {
  // The PAY SPLIT (linehaul, trailer, fuel-surcharge, accessorial %) lives in
  // settlement_splits now, one row per start date — see types/settlementSplit.ts
  // (Q10, 2026-11-05; NET-01). This row keeps the settings that are not dated.
  carrier_name: string | null; // e.g. "Landstar"; null on own authority
  detention_free_hours: number; // free time per stop before detention accrues
  settlement_day: number; // 0 (Sunday) … 6 (Saturday) — day the weekly settlement lands
  deposit_lag_days: number; // days after the settlement the cash lands; 1 = Thursday
  // The per-diem RATE lives in per_diem_rates (dated rows, GL-136) — not here.
  per_diem_deduct_pct: number; // deductible share (0.80 for DOT drivers)
  hometime_threshold_days: number; // flag the driver page past this many days out
  operation: string; // equipment/discipline — tailors which achievements apply
  // Rate markup tiers — the fraction over break-even for a minimum / good
  // (TAKE IT) / great (STEAL) load, per driven mile. TWO sets: the Scorer grades
  // oversize/hazmat/heavy freight on Specialized, everything else on Standard.
  rate_tier_std_min: number;
  rate_tier_std_target: number;
  rate_tier_std_strong: number;
  rate_tier_spec_min: number;
  rate_tier_spec_target: number;
  rate_tier_spec_strong: number;
  // Target profit margin (profit ÷ revenue) → weekly/daily REVENUE targets.
  // Independent of the rate tiers above.
  margin_goal: number;
}
