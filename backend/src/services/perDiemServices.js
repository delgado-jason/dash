import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";

const STATUSES = ["full", "half", "home"];
const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---- GET a year's marked days ---- (only the user's manual marks; inference is
// computed client-side from loads for the unmarked days)
export async function getPerDiemDays(user_id, year) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100)
    throw new ValidationError("Invalid year");

  const result = await db.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, status
       FROM per_diem_days
      WHERE user_id = $1
        AND day >= make_date($2, 1, 1)
        AND day <= make_date($2, 12, 31)
      ORDER BY day`,
    [user_id, y],
  );
  return result.rows;
}

// ---- UPSERT a day's status ----
export async function upsertPerDiemDay(user_id, day, status) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!isDay(day)) throw new ValidationError("day must be YYYY-MM-DD");
  if (!STATUSES.includes(status))
    throw new ValidationError("status must be full, half, or home");

  const result = await db.query(
    `INSERT INTO per_diem_days (user_id, day, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day)
     DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
     RETURNING to_char(day, 'YYYY-MM-DD') AS day, status`,
    [user_id, day, status],
  );
  return result.rows[0];
}

// ---- CLEAR a day ---- (back to unmarked → inference/home applies again)
export async function deletePerDiemDay(user_id, day) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!isDay(day)) throw new ValidationError("day must be YYYY-MM-DD");
  await db.query(`DELETE FROM per_diem_days WHERE user_id = $1 AND day = $2`, [
    user_id,
    day,
  ]);
  return { day, cleared: true };
}
