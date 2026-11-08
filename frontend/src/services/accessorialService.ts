import api from "./api";
import type { Accessorial } from "@/types/accessorial";

export const getAccessorials = async (
  load_id: string,
): Promise<Accessorial[]> => {
  try {
    const response = await api.get(`/accessorials/load/${load_id}`);
    return response.data.accessorials;
  } catch {
    throw new Error("Unable to fetch accessorials");
  }
};

// Every accessorial on the account in one request (the Integrity page reads the
// whole set). Postgres numeric arrives as a string, so the amount is coerced.
export const getAllAccessorials = async (): Promise<Accessorial[]> => {
  try {
    const response = await api.get("/accessorials");
    return (response.data.accessorials as Accessorial[]).map((a) => ({
      ...a,
      amount: Number(a.amount),
    }));
  } catch {
    throw new Error("Unable to fetch accessorials");
  }
};
