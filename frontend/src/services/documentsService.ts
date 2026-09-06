import api from "./api";
import type { LoadDocument } from "@/types/document";

export const getLoadDocuments = async (
  load_id: string,
): Promise<LoadDocument[]> => {
  try {
    const response = await api.get(`/documents/load/${load_id}`);
    return response.data.documents;
  } catch {
    throw new Error("Unable to fetch documents");
  }
};
