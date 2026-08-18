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

// ---- accounts (the snapshot's shape is data too) ----

const ACCOUNT_FIELDS = ["name", "role", "position", "active"];

export async function getAccounts(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT * FROM public.plan_accounts WHERE user_id = $1 ORDER BY position, created_at`,
    [user_id],
  );
  return result.rows;
}

export async function createAccount(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const fields = pick(data, ACCOUNT_FIELDS);
  if (!fields.name || !fields.role)
    throw new ValidationError("An account needs a name and a role");
  const cols = Object.keys(fields);
  const result = await db.query(
    `INSERT INTO public.plan_accounts (user_id, ${cols.join(", ")})
     VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING *`,
    [user_id, ...Object.values(fields)],
  );
  return result.rows[0];
}

export async function patchAccount(user_id, account_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!account_id) throw new ValidationError("Missing account_id");
  const fields = pick(data, ACCOUNT_FIELDS);
  if (Object.keys(fields).length === 0)
    throw new ValidationError("Nothing to update");
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 3}`);
  const result = await db.query(
    `UPDATE public.plan_accounts SET ${sets.join(", ")}
     WHERE user_id = $1 AND account_id = $2 RETURNING *`,
    [user_id, account_id, ...Object.values(fields)],
  );
  if (result.rowCount === 0) throw new NotFoundError("Account not found");
  return result.rows[0];
}

// ---- account snapshots (append-only; balances ride per-account rows) ----

export async function getSnapshots(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const snaps = await db.query(
    `SELECT * FROM public.account_snapshots WHERE user_id = $1 ORDER BY as_of`,
    [user_id],
  );
  const balances = await db.query(
    `SELECT snapshot_id, account_id, balance FROM public.snapshot_balances WHERE user_id = $1`,
    [user_id],
  );
  return snaps.rows.map((sn) => ({
    ...sn,
    balances: balances.rows
      .filter((b) => b.snapshot_id === sn.snapshot_id)
      .map(({ account_id, balance }) => ({ account_id, balance })),
  }));
}

export async function createSnapshot(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { as_of, note, balances } = data;
  if (!as_of) throw new ValidationError("Missing as_of date");
  if (!Array.isArray(balances) || balances.length === 0)
    throw new ValidationError("A snapshot needs at least one balance");
  for (const b of balances) {
    if (!b.account_id || b.balance == null || isNaN(Number(b.balance)))
      throw new ValidationError("Every balance needs an account and a number");
  }
  // One snapshot + its balances land together or not at all.
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const snap = await client.query(
      `INSERT INTO public.account_snapshots (user_id, as_of, note)
       VALUES ($1, $2, $3) RETURNING *`,
      [user_id, as_of, note ?? null],
    );
    for (const b of balances) {
      await client.query(
        `INSERT INTO public.snapshot_balances (snapshot_id, account_id, user_id, balance)
         VALUES ($1, $2, $3, $4)`,
        [snap.rows[0].snapshot_id, b.account_id, user_id, b.balance],
      );
    }
    await client.query("COMMIT");
    return { ...snap.rows[0], balances };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
