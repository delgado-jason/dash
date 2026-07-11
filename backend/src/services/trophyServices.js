import { db } from "../../db/pool.js";
import { validateTrophy, isTrophyKey } from "../utils/validation/trophyValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const COLUMNS = "trophy_key, earned, earned_on, image_url, notes, created_at, updated_at";
const WRITABLE = ["earned", "earned_on", "image_url", "notes"];

export async function getTrophies(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const r = await db.query(
    `SELECT ${COLUMNS} FROM trophies WHERE user_id = $1 ORDER BY trophy_key`,
    [user_id],
  );
  return r.rows;
}

// Create or update one trophy row (mark earned, set earned_on, attach art).
export async function upsertTrophy(user_id, trophy_key, body) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!isTrophyKey(trophy_key)) throw new ValidationError("Unknown trophy_key");

  for (const f in body)
    if (!WRITABLE.includes(f)) throw new ValidationError(`${f} not allowed`);
  const errors = validateTrophy(body);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const fields = ["user_id", "trophy_key"];
  const values = [user_id, trophy_key];
  const placeholders = ["$1", "$2"];
  const setParts = [];
  let i = 3;
  for (const f of WRITABLE) {
    if (body[f] !== undefined) {
      fields.push(f);
      values.push(body[f]);
      placeholders.push(`$${i}`);
      setParts.push(`${f} = EXCLUDED.${f}`);
      i++;
    }
  }
  const setClause = setParts.length
    ? `${setParts.join(", ")}, updated_at = NOW()`
    : "updated_at = NOW()";

  const r = await db.query(
    `INSERT INTO trophies (${fields.join(", ")})
     VALUES (${placeholders.join(", ")})
     ON CONFLICT (user_id, trophy_key) DO UPDATE SET ${setClause}
     RETURNING ${COLUMNS}`,
    values,
  );
  return r.rows[0];
}

export async function deleteTrophy(user_id, trophy_key) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trophy_key) throw new ValidationError("Missing trophy_key");
  const r = await db.query(
    `DELETE FROM trophies WHERE user_id = $1 AND trophy_key = $2 RETURNING trophy_key`,
    [user_id, trophy_key],
  );
  if (r.rowCount === 0) throw new NotFoundError("Trophy not found");
  return r.rows[0];
}
