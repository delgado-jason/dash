import api from "./api";
import type { ComplianceItem, ComplianceItemInput } from "@/types/compliance";

export const getComplianceItems = async (): Promise<ComplianceItem[]> => {
  const res = await api.get("/compliance");
  return res.data.compliance_items;
};

export const createComplianceItem = async (
  data: ComplianceItemInput,
): Promise<ComplianceItem> => {
  const res = await api.post("/compliance", data);
  return res.data.compliance_item;
};

export const updateComplianceItem = async (
  id: string,
  data: Partial<ComplianceItemInput>,
): Promise<ComplianceItem> => {
  const res = await api.patch(`/compliance/${id}`, data);
  return res.data.compliance_item;
};

export const deleteComplianceItem = async (id: string): Promise<void> => {
  await api.delete(`/compliance/${id}`);
};
