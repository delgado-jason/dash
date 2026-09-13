import api from "./api";
import { AxiosError } from "axios";
import type { Agency } from "@/types/agency";
import type { SettlementOnlyRow } from "@/lib/agencies/agencyMetrics";

// The API's own sentence and its details, when it sent one — "That agency code
// is already on file." reaches the person who typed it instead of a useless
// generic line. null when the failure carried no body (a dead network), and
// the caller's own fallback takes over.
const serverSentence = (error: unknown): string | null => {
  if (error instanceof AxiosError && error.response?.data) {
    const body = error.response.data as { error?: string; details?: string[] };
    const detail =
      Array.isArray(body.details) && body.details.length ? ` — ${body.details.join("; ")}` : "";
    if (body.error) return `${body.error}${detail}`;
  }
  return null;
};

export const getAgencies = async (): Promise<Agency[]> => {
  try {
    const response = await api.get("/agencies");
    return response.data.agencies;
  } catch {
    throw new Error("Unable to fetch agencies");
  }
};

// Freight a settlement paid that never became a load in dash, by code and load
// number. The YEAR RULE is the server's: with no `since` it answers from Jan 1
// of the account's current year, and hands that floor back so the shelf prints
// the year it is actually showing.
export interface SettlementOnly {
  since: string; // 'YYYY-MM-DD' — the floor the query used
  rows: SettlementOnlyRow[];
}

export const getSettlementOnly = async (since?: string): Promise<SettlementOnly> => {
  try {
    const response = await api.get("/agencies/settlement-only", {
      params: since ? { since } : undefined,
    });
    return { since: response.data.since, rows: response.data.rows ?? [] };
  } catch (error) {
    // The backend's own sentence, same as patchAgency: a bad `since` answers
    // "since is not a real calendar date", which tells the reader what to fix.
    // A network failure with no body keeps the generic line.
    throw new Error(serverSentence(error) ?? "Unable to fetch the settlement-only history");
  }
};

// What the owner may correct on an agency: the legal name off the bill, the
// code itself (one typed wrong has to be fixable), and the contact details.
// posting_codes is absent on purpose — it is evidence the settlement feed
// appends to, and the API refuses a client that sends it.
export interface PatchAgencyInput {
  agency_code?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export const patchAgency = async (
  agency_id: string,
  data: PatchAgencyInput,
): Promise<Agency> => {
  try {
    const response = await api.patch(`/agencies/${agency_id}`, data);
    return response.data.agency;
  } catch (error) {
    // The backend's own sentence — same shape as createAgencyService.
    throw new Error(serverSentence(error) ?? "Unable to save the agency");
  }
};
