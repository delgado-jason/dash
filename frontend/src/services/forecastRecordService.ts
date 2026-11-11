import api from "./api";
import type { ForecastRecord } from "@/lib/metrics/forecastScore";

export const getForecastRecords = async (): Promise<ForecastRecord[]> => {
  const res = await api.get("/forecast-records");
  return res.data.records ?? [];
};

// Idempotent by design: the server answers { recorded: false } for a period it
// already holds rather than overwriting a forecast with a later, better-
// informed one. The caller does not need to check first.
export const recordForecast = async (body: {
  pay_week_start: string;
  pay_week_end: string;
  forecast_ending: number | null;
  forecast_deposit: number | null;
  forecast_fuel: number | null;
  a_weekly_revenue: number | null;
  a_weekly_advance: number | null;
  a_weekly_deductions: number | null;
  a_weekly_payroll: number | null;
  days_before_end: number;
}): Promise<{ recorded: boolean }> => {
  const res = await api.post("/forecast-records", body);
  return res.data;
};
