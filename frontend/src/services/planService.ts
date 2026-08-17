import api from "./api";

// The plan framework + Friday snapshots. Numeric columns arrive as strings.
export interface PlanStageRow {
  stage_id: string;
  plan_id: string;
  position: number;
  label: string;
  kind: "vault" | "obligation" | "trailer";
  obligation_id: string | null;
  target_lo: string | null;
  target_hi: string | null;
}

export interface PlanRow {
  plan_id: string;
  label: string;
  year: number;
  float_line: string;
  float_line_home_lo: string | null;
  float_line_home_hi: string | null;
  maintenance_weekly: string;
  tax_weekly: string;
  active: boolean;
  stages: PlanStageRow[];
}

export interface SnapshotRow {
  snapshot_id: string;
  as_of: string;
  ops: string;
  vault: string;
  maintenance: string;
  tax: string;
  trailer: string;
  note: string | null;
}

export const getPlans = async (): Promise<PlanRow[]> => {
  const res = await api.get("/plans");
  return res.data.plans;
};

export const createPlan = async (data: Record<string, unknown>): Promise<PlanRow> => {
  const res = await api.post("/plans", data);
  return res.data.plan;
};

export const patchPlan = async (id: string, data: Record<string, unknown>): Promise<void> => {
  await api.patch(`/plans/${id}`, data);
};

export const createStage = async (planId: string, data: Record<string, unknown>): Promise<PlanStageRow> => {
  const res = await api.post(`/plans/${planId}/stages`, data);
  return res.data.stage;
};

export const patchStage = async (stageId: string, data: Record<string, unknown>): Promise<void> => {
  await api.patch(`/plans/stages/${stageId}`, data);
};

export const deleteStage = async (stageId: string): Promise<void> => {
  await api.delete(`/plans/stages/${stageId}`);
};

export const getSnapshots = async (): Promise<SnapshotRow[]> => {
  const res = await api.get("/plans/snapshots/all");
  return res.data.snapshots;
};

export const createSnapshot = async (data: Record<string, unknown>): Promise<SnapshotRow> => {
  const res = await api.post("/plans/snapshots", data);
  return res.data.snapshot;
};
