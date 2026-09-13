import api from "./api";
import { AxiosError } from "axios";

// agent_tier_history (073) — every tier decision, with its reason. Rows come
// joined with the agent's name and code and the signer's display name, so the
// Review prints them without a second lookup. Integer columns (the tiers)
// arrive as numbers; null = "no tier" (a Prospect).
export interface TierHistoryRow {
  history_id: string;
  agent_id: string;
  from_tier: number | null;
  to_tier: number | null;
  reason: string;
  source: "owner" | "dash";
  changed_by: string | null;
  changed_at: string; // ISO
  first_name: string;
  last_name: string;
  agency_code: string | null;
  changed_by_name: string | null;
}

const named = (error: unknown, fallback: string): Error => {
  if (error instanceof AxiosError && error.response?.data) {
    const body = error.response.data as { error?: string; details?: string[] };
    const detail = Array.isArray(body.details) && body.details.length ? ` — ${body.details.join("; ")}` : "";
    if (body.error) return new Error(`${body.error}${detail}`);
  }
  return new Error(fallback);
};

// The account's whole trail — small by nature (a few moves a month).
export const getTierHistory = async (): Promise<TierHistoryRow[]> => {
  const res = await api.get("/agents/tier-history");
  return res.data.history ?? [];
};

// The owner's HOLD on a suggestion: a history row with from = to = the current
// tier and "hold — {evidence}" as its reason. Owner only — the backend says
// "Only the owner sets tiers." to anyone else.
export const holdTier = async (agent_id: string, reason: string): Promise<TierHistoryRow> => {
  try {
    const res = await api.post(`/agents/${agent_id}/tier-hold`, { reason });
    return res.data.history;
  } catch (error) {
    throw named(error, "Couldn't record the hold");
  }
};
