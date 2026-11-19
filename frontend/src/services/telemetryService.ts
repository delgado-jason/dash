import api from "./api";

// dash about itself, read back: who opened which page, and the errors caught.
// Owner only (and the watch token, which reads as the owner).

export interface AppHitRow {
  page: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  views: number;
  last_at: string;
}

export interface AppHitsSummary {
  days: number;
  views: number;
  people: number;
  first_at: string | null;
  last_at: string | null;
  since: string | null; // the first row ever — when the beacon began
  last_ever: string | null; // the last opening ever, inside the window or not
  rows: AppHitRow[];
}

export interface AppErrorRow {
  message: string;
  page: string;
  kind: string;
  count: number;
  first_at: string;
  last_at: string;
  last_stack: string | null;
  last_user_id: string | null;
  last_version: string | null;
}

export interface AppErrors {
  days: number;
  total: number;
  rows: AppErrorRow[];
}

export const getAppHitsSummary = async (days = 30): Promise<AppHitsSummary> => {
  const res = await api.get("/app/hits/summary", { params: { days } });
  return res.data;
};

export const getAppErrors = async (days = 30): Promise<AppErrors> => {
  const res = await api.get("/app/errors", { params: { days } });
  return res.data;
};
