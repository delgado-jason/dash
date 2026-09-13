import api from "./api";
import type {
  ComplianceItem,
  ComplianceItemInput,
  ComplianceRenewal,
  RenewalInput,
} from "@/types/compliance";
import type { Driver } from "@/types/driver";

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

// ---- Mark renewed ----
// Every one of these lets the axios error through untouched: the page reads the
// server's own sentence off `response.data.error`, so a failure says "The next
// expiry has to come after the renewal date." and not "Could not save".

export const renewComplianceItem = async (
  id: string,
  body: RenewalInput,
): Promise<ComplianceItem> => {
  const res = await api.post(`/compliance/${id}/renew`, body);
  return res.data.compliance_item;
};

export const getComplianceRenewals = async (
  id: string,
): Promise<ComplianceRenewal[]> => {
  const res = await api.get(`/compliance/${id}/renewals`);
  return res.data.renewals;
};

// The CDL has no compliance_items row — it renews through the driver record and
// comes back as the updated driver.
export const renewDriverCdl = async (
  driverId: string,
  body: RenewalInput,
): Promise<Driver> => {
  const res = await api.post(`/drivers/${driverId}/cdl-renew`, body);
  return res.data.driver;
};

export const getDriverCdlRenewals = async (
  driverId: string,
): Promise<ComplianceRenewal[]> => {
  const res = await api.get(`/drivers/${driverId}/cdl-renewals`);
  return res.data.renewals;
};
