import api from "./api";
import type {
  SettlementSummary,
  SettlementLine,
  LoadSettlementSummary,
} from "@/types/settlement";

export const getSettlements = async (): Promise<SettlementSummary[]> => {
  try {
    const response = await api.get("/settlements");
    return response.data.settlements;
  } catch {
    throw new Error("Unable to fetch settlements");
  }
};

export const getLoadSettlementLines = async (
  load_id: string,
): Promise<SettlementLine[]> => {
  try {
    const response = await api.get(`/settlements/load/${load_id}`);
    return response.data.lines;
  } catch {
    throw new Error("Unable to fetch settlement lines");
  }
};

export const getSettlementsByLoad = async (): Promise<LoadSettlementSummary[]> => {
  try {
    const response = await api.get("/settlements/by-load");
    return response.data.rows;
  } catch {
    throw new Error("Unable to fetch settlement summaries");
  }
};
