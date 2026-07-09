import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- LIST ----
export async function getObligations(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT obligation_id, label, amount, active
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
  const { label, amount } = data;
  if (!label || amount == null)
    throw new ValidationError("label and amount are required");

  const result = await db.query(
    `INSERT INTO obligations (user_id, label, amount)
     VALUES ($1, $2, $3)
     RETURNING obligation_id, label, amount, active`,
    [user_id, label, amount],
  );
  return result.rows[0];
}

// ---- PATCH ---- (edit label / amount / active)
export async function patchObligation(user_id, obligation_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!obligation_id) throw new ValidationError("Missing obligation_id");

  const allowedFields = ["label", "amount", "active"];
  const updates = [];
  const values = [];
  let index = 1;
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(data[field]);
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
     RETURNING obligation_id, label, amount, active`,
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
