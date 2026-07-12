// The carrier pay fractions that turn a load's full customer rate into the
// owner-op's net (their company gross). 0.65 = 65%. Coerced to numbers in the
// service so the UI works in plain fractions.
export interface SettlementSchedule {
  linehaul_pct: number;
  trailer_pct: number;
  fuel_surcharge_pct: number;
  accessorial_pct: number;
}
