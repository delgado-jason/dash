import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// The plan framework: plans carry the year's thresholds, plan_stages carry the
// waterfall as ordered data. Numeric columns serialize as strings — the
// frontend coerces before math, per house rule.

const PLAN_FIELDS = [
  "label", "year", "float_line", "float_line_home_lo", "float_line_home_hi",
  "maintenance_weekly", "tax_weekly", "active",
];
const STAGE_FIELDS = ["position", "label", "kind", "obligation_id", "target_lo", "target_hi"];

const pick = (data, allowed) => {
  const out = {};
  for (const k of allowed) if (data[k] !== undefined) out[k] = data[k];
  return out;
};

export async function getPlans(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const plans = await db.query(
    `SELECT * FROM public.plans WHERE user_id = $1 ORDER BY year DESC, created_at DESC`,
    [user_id],
  );
  const stages = await db.query(
    `SELECT * FROM public.plan_stages WHERE user_id = $1 ORDER BY position`,
    [user_id],
  );
  return plans.rows.map((p) => ({
    ...p,
    stages: stages.rows.filter((s) => s.plan_id === p.plan_id),
  }));
}

export async function createPlan(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const fields = pick(data, PLAN_FIELDS);
  if (!fields.label || !fields.year)
    throw new ValidationError("A plan needs a label and a year");
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const result = await db.query(
    `INSERT INTO public.plans (user_id, ${cols.join(", ")})
     VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING *`,
    [user_id, ...vals],
  );
  // Making a plan active retires the others — one active plan at a time.
  if (fields.active) {
    await db.query(
      `UPDATE public.plans SET active = false WHERE user_id = $1 AND plan_id != $2`,
      [user_id, result.rows[0].plan_id],
    );
  }
  return result.rows[0];
}

export async function patchPlan(user_id, plan_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!plan_id) throw new ValidationError("Missing plan_id");
  const fields = pick(data, PLAN_FIELDS);
  if (Object.keys(fields).length === 0)
    throw new ValidationError("Nothing to update");
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 3}`);
  const result = await db.query(
    `UPDATE public.plans SET ${sets.join(", ")}, updated_at = now()
     WHERE user_id = $1 AND plan_id = $2 RETURNING *`,
    [user_id, plan_id, ...Object.values(fields)],
  );
  if (result.rowCount === 0) throw new NotFoundError("Plan not found");
  if (fields.active === true) {
    await db.query(
      `UPDATE public.plans SET active = false WHERE user_id = $1 AND plan_id != $2`,
      [user_id, plan_id],
    );
  }
  return result.rows[0];
}

export async function createStage(user_id, plan_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!plan_id) throw new ValidationError("Missing plan_id");
  const fields = pick(data, STAGE_FIELDS);
  if (!fields.label || !fields.kind || fields.position == null)
    throw new ValidationError("A stage needs a label, kind, and position");
  const cols = Object.keys(fields);
  const result = await db.query(
    `INSERT INTO public.plan_stages (user_id, plan_id, ${cols.join(", ")})
     VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING *`,
    [user_id, plan_id, ...Object.values(fields)],
  );
  return result.rows[0];
}

export async function patchStage(user_id, stage_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!stage_id) throw new ValidationError("Missing stage_id");
  const fields = pick(data, STAGE_FIELDS);
  if (Object.keys(fields).length === 0)
    throw new ValidationError("Nothing to update");
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 3}`);
  const result = await db.query(
    `UPDATE public.plan_stages SET ${sets.join(", ")}
     WHERE user_id = $1 AND stage_id = $2 RETURNING *`,
    [user_id, stage_id, ...Object.values(fields)],
  );
  if (result.rowCount === 0) throw new NotFoundError("Stage not found");
  return result.rows[0];
}

export async function deleteStage(user_id, stage_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!stage_id) throw new ValidationError("Missing stage_id");
  // Deletes target the stage's OWN id — never a parent fk (house rule).
  const result = await db.query(
    `DELETE FROM public.plan_stages WHERE user_id = $1 AND stage_id = $2`,
    [user_id, stage_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Stage not found");
}

// ---- account snapshots (append-only) ----

export async function getSnapshots(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT * FROM public.account_snapshots WHERE user_id = $1 ORDER BY as_of`,
    [user_id],
  );
  return result.rows;
}

export async function createSnapshot(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { as_of, ops, vault, maintenance, tax, trailer, note } = data;
  if (!as_of) throw new ValidationError("Missing as_of date");
  for (const [k, v] of Object.entries({ ops, vault, maintenance, tax })) {
    if (v == null || isNaN(Number(v)))
      throw new ValidationError(`${k} must be a number`);
  }
  const result = await db.query(
    `INSERT INTO public.account_snapshots (user_id, as_of, ops, vault, maintenance, tax, trailer, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [user_id, as_of, ops, vault, maintenance, tax, trailer ?? 0, note ?? null],
  );
  return result.rows[0];
}
