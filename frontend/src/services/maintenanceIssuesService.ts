import api from "./api";
import type { MaintenanceIssue, IssueSeverity, MaintenanceUnit } from "@/types/maintenance";

/* eslint-disable @typescript-eslint/no-explicit-any */
const coerceIssue = (i: any): MaintenanceIssue => ({
  issue_id: i.issue_id,
  unit: i.unit,
  what: i.what,
  noticed_on: String(i.noticed_on).slice(0, 10),
  severity: i.severity,
  status: i.status,
  closed_by_service_id: i.closed_by_service_id ?? null,
  closed_on: i.closed_on == null ? null : String(i.closed_on).slice(0, 10),
  notes: i.notes ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface IssueInput {
  unit?: MaintenanceUnit;
  what: string;
  noticed_on: string; // 'YYYY-MM-DD'
  severity?: IssueSeverity;
  notes?: string | null;
}

export const getMaintenanceIssues = async (): Promise<MaintenanceIssue[]> => {
  const res = await api.get("/maintenance/issues");
  return res.data.issues.map(coerceIssue);
};

export const createMaintenanceIssue = async (data: IssueInput): Promise<MaintenanceIssue> => {
  const res = await api.post("/maintenance/issues", data);
  return coerceIssue(res.data.issue);
};

export const patchMaintenanceIssue = async (id: string, data: Partial<IssueInput>): Promise<MaintenanceIssue> => {
  const res = await api.patch(`/maintenance/issues/${id}`, data);
  return coerceIssue(res.data.issue);
};

// Closed by hand — it went away, or was fixed off the log. A service closes
// the issues it fixes itself, through the log sheet.
export const closeMaintenanceIssue = async (id: string, closed_on?: string): Promise<MaintenanceIssue> => {
  const res = await api.post(`/maintenance/issues/${id}/close`, closed_on ? { closed_on } : {});
  return coerceIssue(res.data.issue);
};

export const reopenMaintenanceIssue = async (id: string): Promise<MaintenanceIssue> => {
  const res = await api.post(`/maintenance/issues/${id}/reopen`, {});
  return coerceIssue(res.data.issue);
};

export const deleteMaintenanceIssue = async (id: string): Promise<void> => {
  await api.delete(`/maintenance/issues/${id}`);
};
