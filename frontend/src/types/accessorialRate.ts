// A named accessorial charge and the fraction of it the owner-op keeps after the
// carrier's cut (0.73 = 73%). Drives the load-entry dropdown + the Settings editor.
export interface AccessorialRate {
  accessorial_type: string;
  pay_pct: number;
  // Q8 (Jason, 2026-11-05): a pass-through is money handed back for a cost he
  // paid (tolls) — it reaches him at pay_pct but is not revenue: out of gross,
  // the rate per mile, the booking stats and the earned net; in what the
  // statement pays (NET-02). Tolls only, for now.
  pass_through: boolean;
}
