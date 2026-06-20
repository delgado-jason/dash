export type MetricCardFormat = "number" | "string" | "currency" | "percent";

export interface Metric {
  label: string;
  value: number | string | null;
  format: MetricCardFormat;
}
