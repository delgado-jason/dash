export type PerDiemStatus = "full" | "half" | "home";

export interface PerDiemDay {
  // A day he INTENDS to be home, not one that happened (migration 107). Only
  // ever true on a `home` day; the deduction and the utilization window both
  // ignore it. Absent on rows written before 107 → treat as false.
  planned?: boolean;
  day: string; // "YYYY-MM-DD"
  status: PerDiemStatus;
}
