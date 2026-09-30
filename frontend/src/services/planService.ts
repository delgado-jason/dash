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
  // Retired by 083 — kept on the row for history, unused.
  maintenance_weekly: string;
  tax_weekly: string;
  // ADMIN-03 (#500): the rate table, the floors and the split as settings.
  maintenance_per_mile: string;
  tax_pct: string;
  maintenance_floor: string;
  min_move: string;
  objective_pct: string;
  first_money_month: string; // YYYY-MM-DD, the first of the first month under the rules
  active: boolean;
  stages: PlanStageRow[];
}

export interface AccountRow {
  account_id: string;
  name: string;
  // ops floats, vault runs the cascade, maintenance is the working minimum,
  // tax takes the tax move; reserve is just watched.
  role: "ops" | "vault" | "maintenance" | "tax" | "reserve";
  position: number;
  active: boolean;
}

export interface SnapshotRow {
  snapshot_id: string;
  as_of: string;
  note: string | null;
  // The accrual this snapshot made (miles + the latest pay week covered) and
  // the month its money day settled — null on a plain Friday.
  miles: string | number | null;
  pay_week_start: string | null; // YYYY-MM-DD
  settles_month: string | null; // YYYY-MM-DD, first of the month
  balances: { account_id: string; balance: string | number }[];
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

export const getAccounts = async (): Promise<AccountRow[]> => {
  const res = await api.get("/plans/accounts/all");
  return res.data.accounts;
};

export const createAccount = async (data: Record<string, unknown>): Promise<AccountRow> => {
  const res = await api.post("/plans/accounts", data);
  return res.data.account;
};

export const patchAccount = async (id: string, data: Record<string, unknown>): Promise<void> => {
  await api.patch(`/plans/accounts/${id}`, data);
};

export const getSnapshots = async (): Promise<SnapshotRow[]> => {
  const res = await api.get("/plans/snapshots/all");
  return res.data.snapshots;
};

export const createSnapshot = async (data: Record<string, unknown>): Promise<SnapshotRow> => {
  const res = await api.post("/plans/snapshots", data);
  return res.data.snapshot;
};

// OPS NOW (#502): the bank's Ops balance typed on a date, kept. One per day —
// a second entry the same day replaces the first. The cash board re-bases from
// the latest of a snapshot or a check, and prints the gap against its own
// figure for that morning.
export interface OpsCheckRow {
  check_id: string;
  as_of: string; // YYYY-MM-DD
  balance: string | number; // numeric — coerce at the boundary
  note: string | null;
}

export const getOpsChecks = async (): Promise<OpsCheckRow[]> => {
  const res = await api.get("/plans/ops-checks/all");
  return res.data.checks;
};

export const createOpsCheck = async (data: {
  as_of: string;
  balance: number;
  note: string | null;
}): Promise<OpsCheckRow> => {
  const res = await api.post("/plans/ops-checks", data);
  return res.data.check;
};
