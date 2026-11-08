import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/error.js";
import { validateFscSchedule } from "../utils/validation/fscScheduleValidation.js";
import { monthDay } from "../utils/validation/moneyFields.js";

// GL-155 · Landstar's fuel-surcharge band tables. Every pasted table is kept;
// the one in force on a day is the latest effective_from on or before it.
// effective_from is a DATE returned as 'YYYY-MM-DD' (never a timestamp).
const RETURNING = `schedule_id,
  to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
  bands, note, created_at`;

const longDay = (ymd) => `${monthDay(ymd)}, ${String(ymd).slice(0, 4)}`;

export async function listFscSchedules(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${RETURNING}
       FROM fsc_schedules
      WHERE user_id = $1
      ORDER BY effective_from DESC`,
    [user_id],
  );
  return result.rows;
}

export async function createFscSchedule(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { values: v, errors } = validateFscSchedule(data);
  if (errors.length > 0) throw new ValidationError(errors[0], errors);
  try {
    const result = await db.query(
      `INSERT INTO fsc_schedules (user_id, effective_from, bands, note)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING ${RETURNING}`,
      [user_id, v.effective_from, JSON.stringify(v.bands), v.note ?? null],
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505")
      throw new ConflictError(
        `a table already starts on ${longDay(v.effective_from)} — remove that one first`,
      );
    throw err;
  }
}

export async function deleteFscSchedule(user_id, schedule_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!schedule_id) throw new ValidationError("Missing schedule_id");
  const result = await db.query(
    `DELETE FROM fsc_schedules WHERE user_id = $1 AND schedule_id = $2`,
    [user_id, schedule_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("no surcharge table with that id");
  return true;
}
