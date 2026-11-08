import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import { validateObligation } from "../utils/validation/obligationValidation.js";

// ---- LIST ----
export async function getObligations(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT obligation_id, label, amount, active, is_draw,
            category, day_of_month, draft_amount, on_pl,
            original_balance, current_balance, balance_as_of, payoff_date,
            asset_type, asset_id
     FROM obligations
     WHERE user_id = $1
     ORDER BY created_at`,
    [user_id],
  );
  return result.rows;
}

// ---- CREATE ----
export async function createObligation(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const {
    label,
    amount,
    is_draw,
    category,
    day_of_month,
    draft_amount,
    on_pl,
    original_balance,
    current_balance,
    balance_as_of,
    payoff_date,
    asset_type,
    asset_id,
  } = data;
  if (!label || amount == null)
    throw new ValidationError("label and amount are required");
  // CASH-16: money fields, the draft day and the draw/P&L exclusion are
  // refused with a sentence before any SQL.
  const checked = validateObligation(data);
  if (checked.errors.length > 0) throw new ValidationError(checked.errors[0], checked.errors);
  const v = checked.values;

  const result = await db.query(
    `INSERT INTO obligations
       (user_id, label, amount, is_draw, category, day_of_month, draft_amount,
        on_pl, original_balance, current_balance,
        balance_as_of, payoff_date, asset_type, asset_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING obligation_id, label, amount, active, is_draw,
               category, day_of_month, draft_amount, on_pl,
               original_balance, current_balance, balance_as_of, payoff_date,
               asset_type, asset_id`,
    [
      user_id,
      label,
      v.amount,
      is_draw === true,
      category || 'other',
      v.day_of_month ?? null,
      v.draft_amount ?? null,
      on_pl === true,
      v.original_balance ?? null,
      v.current_balance ?? null,
      v.balance_as_of || null,
      v.payoff_date || null,
      asset_type || null,
      asset_id || null,
    ],
  );
  return result.rows[0];
}

// ---- PATCH ---- (edit label / amount / active)
export async function patchObligation(user_id, obligation_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!obligation_id) throw new ValidationError("Missing obligation_id");

  const allowedFields = [
    "label",
    "amount",
    "active",
    "is_draw",
    "category",
    "day_of_month",
    "draft_amount",
    "on_pl",
    "original_balance",
    "current_balance",
    "balance_as_of",
    "payoff_date",
    "asset_type",
    "asset_id",
  ];
  // CASH-16: judge the patch against the stored row (a patch may flip `active`
  // or clear the draft day alone), before any write.
  const stored = await db.query(
    `SELECT active, is_draw, on_pl, day_of_month
       FROM obligations
      WHERE obligation_id = $1 AND user_id = $2`,
    [obligation_id, user_id],
  );
  if (stored.rowCount === 0) throw new NotFoundError("Obligation not found");
  const checked = validateObligation(data, { partial: true, existing: stored.rows[0] });
  if (checked.errors.length > 0) throw new ValidationError(checked.errors[0], checked.errors);

  const updates = [];
  const values = [];
  let index = 1;
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(field in checked.values ? checked.values[field] : data[field]);
      index++;
    }
  }
  if (updates.length === 0)
    throw new ValidationError("No valid fields to update");

  updates.push(`updated_at = NOW()`);
  values.push(obligation_id, user_id);

  const result = await db.query(
    `UPDATE obligations
       SET ${updates.join(", ")}
     WHERE obligation_id = $${index} AND user_id = $${index + 1}
     RETURNING obligation_id, label, amount, active, is_draw,
               category, day_of_month, draft_amount, on_pl,
               original_balance, current_balance, balance_as_of, payoff_date,
               asset_type, asset_id`,
    values,
  );
  if (result.rowCount === 0) throw new NotFoundError("Obligation not found");
  return result.rows[0];
}

// ---- DELETE ----
export async function deleteObligation(user_id, obligation_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!obligation_id) throw new ValidationError("Missing obligation_id");

  const result = await db.query(
    `DELETE FROM obligations
     WHERE obligation_id = $1 AND user_id = $2
     RETURNING obligation_id`,
    [obligation_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Obligation not found");
  return result.rows[0];
}
