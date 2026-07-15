export type PerDiemStatus = "full" | "half" | "home";

export interface PerDiemDay {
  day: string; // "YYYY-MM-DD"
  status: PerDiemStatus;
}
