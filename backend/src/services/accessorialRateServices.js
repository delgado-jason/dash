import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- LIST ---- (the user's accessorial types + pay rates; drives the Settings
// editor and the load-entry dropdown)
export async function getAccessorialRates(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT accessorial_type, pay_pct
       FROM accessorial_pay_rates
      WHERE user_id = $1
      ORDER BY accessorial_type`,
    [user_id],
  );
  return result.rows;
}

// ---- UPSERT ---- (add a type or change its rate)
export async function upsertAccessorialRate(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const accessorial_type = (data.accessorial_type ?? "").trim();
  if (!accessorial_type) throw new ValidationError("accessorial_type is required");
  const pct = Number(data.pay_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 2)
    throw new ValidationError("pay_pct must be a fraction between 0 and 2");

  const result = await db.query(
    `INSERT INTO accessorial_pay_rates (user_id, accessorial_type, pay_pct)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, accessorial_type)
       DO UPDATE SET pay_pct = EXCLUDED.pay_pct, updated_at = NOW()
     RETURNING accessorial_type, pay_pct`,
    [user_id, accessorial_type, pct],
  );
  return result.rows[0];
}

// ---- DELETE ---- (remove a type from the list)
export async function deleteAccessorialRate(user_id, accessorial_type) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!accessorial_type) throw new ValidationError("Missing accessorial_type");
  const result = await db.query(
    `DELETE FROM accessorial_pay_rates
      WHERE user_id = $1 AND accessorial_type = $2
     RETURNING accessorial_type`,
    [user_id, accessorial_type],
  );
  if (result.rowCount === 0)
    throw new NotFoundError("Accessorial rate not found");
  return result.rows[0];
}
