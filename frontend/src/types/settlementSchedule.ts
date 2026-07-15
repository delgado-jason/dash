// The carrier pay fractions that turn a load's full customer rate into the
// owner-op's net (their company gross). 0.65 = 65%. Coerced to numbers in the
// service so the UI works in plain fractions.
export interface SettlementSchedule {
  linehaul_pct: number;
  trailer_pct: number;
  fuel_surcharge_pct: number;
  accessorial_pct: number;
  carrier_name: string | null; // e.g. "Landstar"; null on own authority
  detention_free_hours: number; // free time per stop before detention accrues
  per_diem_rate: number; // IRS special M&IE daily rate
  per_diem_deduct_pct: number; // deductible share (0.80 for DOT drivers)
  hometime_threshold_days: number; // flag the driver page past this many days out
  operation: string; // equipment/discipline — tailors which achievements apply
}
