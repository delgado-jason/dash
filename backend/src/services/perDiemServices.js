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
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, status, planned
       FROM per_diem_days
      WHERE user_id = $1
        AND day >= make_date($2, 1, 1)
        AND day <= make_date($2, 12, 31)
      ORDER BY day`,
    [user_id, y],
  );
  return result.rows;
}

// ---- most recent "home" day on or before today ---- (drives the hometime
// metric — "days since you were last home"). null when nothing's marked.
//
// This already excluded future marks by date, which was the old way of saying
// "not a plan". Since 107 it can say it outright, which also catches a plan
// recorded against a day that has already passed.
export async function getLastHomeDay(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT to_char(max(day), 'YYYY-MM-DD') AS last_home
       FROM per_diem_days
      WHERE user_id = $1 AND status = 'home' AND NOT planned
        AND day <= CURRENT_DATE`,
    [user_id],
  );
  return { last_home: result.rows[0]?.last_home ?? null };
}

// ---- all "home" days that HAPPENED ---- (the truck utilization window)
//
// `NOT planned` is the important one in this file. Utilization is a verdict on
// days that have been lived; a day Jason intends to take off is not a day the
// truck sat, and counting one would mark the fleet idle for a week that has
// not come round yet.
export async function getHomeDays(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day
       FROM per_diem_days
      WHERE user_id = $1 AND status = 'home' AND NOT planned
      ORDER BY day`,
    [user_id],
  );
  return result.rows.map((r) => r.day);
}

// ---- the home days still ahead ---- (what the cash board forecasts against)
//
// The mirror of getHomeDays: only the plans, and only the ones that have not
// been overtaken. A plan for a day already past is stale — either it happened,
// in which case it should have been confirmed, or it did not.
export async function getPlannedHomeDays(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day
       FROM per_diem_days
      WHERE user_id = $1 AND planned AND day >= CURRENT_DATE
      ORDER BY day`,
    [user_id],
  );
  return result.rows.map((r) => r.day);
}

// ---- UPSERT a day's status ----
export async function upsertPerDiemDay(user_id, day, status, planned = false) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!isDay(day)) throw new ValidationError("day must be YYYY-MM-DD");
  if (!STATUSES.includes(status))
    throw new ValidationError("status must be full, half, or home");
  if (typeof planned !== "boolean")
    throw new ValidationError("planned must be true or false");
  // The table's own CHECK says this too, but a 400 naming the rule beats a 500
  // carrying a constraint name. A plan is always a plan to be HOME: planning a
  // day away would be a future day inside the tax vocabulary.
  if (planned && status !== "home")
    throw new ValidationError("only a home day can be planned");

  const result = await db.query(
    `INSERT INTO per_diem_days (user_id, day, status, planned)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, day)
     DO UPDATE SET status = EXCLUDED.status, planned = EXCLUDED.planned, updated_at = NOW()
     RETURNING to_char(day, 'YYYY-MM-DD') AS day, status, planned`,
    [user_id, day, status, planned],
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
