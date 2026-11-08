import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/error.js";
import { validatePerDiemRate } from "../utils/validation/perDiemRateValidation.js";
import { monthDay } from "../utils/validation/moneyFields.js";

// GL-136 · dated per-diem rates. The rate in force on a day is the row with the
// latest effective_from on or before it. effective_from is a DATE, returned as a
// 'YYYY-MM-DD' string (never a timestamp); rate is numeric, coerced to a Number.
const RETURNING = `rate_id,
  to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
  rate, note, created_at, updated_at`;

const shape = (row) => (row ? { ...row, rate: Number(row.rate) } : row);

const longDay = (ymd) => `${monthDay(ymd)}, ${String(ymd).slice(0, 4)}`;

const conflict = (day) =>
  new ConflictError(`a rate already starts on ${longDay(day)} — edit that row instead`);

function check(data, opts) {
  const { values, errors } = validatePerDiemRate(data, opts);
  if (errors.length > 0) throw new ValidationError(errors[0], errors);
  return values;
}

export async function listPerDiemRates(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${RETURNING}
       FROM per_diem_rates
      WHERE user_id = $1
      ORDER BY effective_from DESC`,
    [user_id],
  );
  return result.rows.map(shape);
}

export async function createPerDiemRate(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const v = check(data, { partial: false });
  try {
    const result = await db.query(
      `INSERT INTO per_diem_rates (user_id, effective_from, rate, note)
       VALUES ($1, $2, $3, $4)
       RETURNING ${RETURNING}`,
      [user_id, v.effective_from, v.rate, v.note ?? null],
    );
    return shape(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") throw conflict(v.effective_from);
    throw err;
  }
}

export async function updatePerDiemRate(user_id, rate_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!rate_id) throw new ValidationError("Missing rate_id");
  const v = check(data, { partial: true });
  const cols = Object.keys(v);
  if (cols.length === 0) throw new ValidationError("Nothing to update");
  const sets = cols.map((c, i) => `${c} = $${i + 3}`);
  try {
    const result = await db.query(
      `UPDATE per_diem_rates
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE user_id = $1 AND rate_id = $2
        RETURNING ${RETURNING}`,
      [user_id, rate_id, ...cols.map((c) => v[c])],
    );
    if (result.rowCount === 0) throw new NotFoundError("no per-diem rate with that id");
    return shape(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") throw conflict(v.effective_from);
    throw err;
  }
}

export async function deletePerDiemRate(user_id, rate_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!rate_id) throw new ValidationError("Missing rate_id");
  const result = await db.query(
    `DELETE FROM per_diem_rates WHERE user_id = $1 AND rate_id = $2`,
    [user_id, rate_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("no per-diem rate with that id");
  return true;
}
