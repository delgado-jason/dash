import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/error.js";
import { validateFscScalePoint } from "../utils/validation/fscScalePointValidation.js";
import { monthDay } from "../utils/validation/moneyFields.js";

// General items 5b-v · Landstar's weekly scale point. week_of is a DATE
// returned as 'YYYY-MM-DD'; NUMERICs come back as strings, so cast to Number.
const RETURNING = `point_id,
  to_char(week_of, 'YYYY-MM-DD') AS week_of,
  national_avg, cents_per_mile, pct_of_linehaul, regions, note, created_at`;

const longDay = (ymd) => `${monthDay(ymd)}, ${String(ymd).slice(0, 4)}`;

const shape = (r) => ({
  point_id: r.point_id,
  week_of: r.week_of,
  national_avg: Number(r.national_avg),
  cents_per_mile: Number(r.cents_per_mile),
  pct_of_linehaul: r.pct_of_linehaul === null || r.pct_of_linehaul === undefined ? null : Number(r.pct_of_linehaul),
  regions: Array.isArray(r.regions) ? r.regions : [],
  note: r.note ?? null,
  created_at: r.created_at,
});

export async function listFscScalePoints(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${RETURNING}
       FROM fsc_scale_points
      WHERE user_id = $1
      ORDER BY week_of DESC`,
    [user_id],
  );
  return result.rows.map(shape);
}

export async function createFscScalePoint(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { values: v, errors } = validateFscScalePoint(data);
  if (errors.length > 0) throw new ValidationError(errors[0], errors);
  try {
    const result = await db.query(
      `INSERT INTO fsc_scale_points
         (user_id, week_of, national_avg, cents_per_mile, pct_of_linehaul, regions, note)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING ${RETURNING}`,
      [user_id, v.week_of, v.national_avg, v.cents_per_mile, v.pct_of_linehaul, JSON.stringify(v.regions), v.note ?? null],
    );
    return shape(result.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      throw new ConflictError(
        `a point for the week of ${longDay(v.week_of)} is already on file — remove it first`,
      );
    throw err;
  }
}

export async function deleteFscScalePoint(user_id, point_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!point_id) throw new ValidationError("Missing point_id");
  const result = await db.query(
    `DELETE FROM fsc_scale_points WHERE user_id = $1 AND point_id = $2`,
    [user_id, point_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("no scale point with that id");
  return true;
}
