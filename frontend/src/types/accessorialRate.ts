// A named accessorial charge and the fraction of it the owner-op keeps after the
// carrier's cut (0.73 = 73%). Drives the load-entry dropdown + the Settings editor.
export interface AccessorialRate {
  accessorial_type: string;
  pay_pct: number;
}
