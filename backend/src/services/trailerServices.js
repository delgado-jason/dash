import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const SELECT_COLS = `
  trailer_id, unit_number, vin, plate_number, plate_state, trailer_type,
  length_ft, make, model, year, current_hub, status, avatar_url,
  in_service_date, notes, created_at, updated_at`;

const ALLOWED = [
  "unit_number",
  "vin",
  "plate_number",
  "plate_state",
  "trailer_type",
  "length_ft",
  "make",
  "model",
  "year",
  "current_hub",
  "status",
  "avatar_url",
  "in_service_date",
  "notes",
];

// ---- GET ALL TRAILERS ----
export async function getTrailers(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${SELECT_COLS} FROM trailers
     WHERE user_id = $1 AND is_deleted = false
     ORDER BY created_at DESC`,
    [user_id],
  );
  return result.rows;
}

// ---- GET TRAILER BY ID ----
export async function getTrailer(user_id, trailer_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trailer_id) throw new ValidationError("Missing trailer_id");
  const result = await db.query(
    `SELECT ${SELECT_COLS} FROM trailers
     WHERE user_id = $1 AND trailer_id = $2 AND is_deleted = false`,
    [user_id, trailer_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Trailer not found");
  return result.rows[0];
}

// ---- CREATE TRAILER ----
export async function createTrailer(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!data.unit_number) throw new ValidationError("unit_number is required");

  const fields = ["user_id"];
  const values = [user_id];
  const placeholders = ["$1"];
  let i = 2;
  for (const field of ALLOWED) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${i}`);
      i++;
    }
  }

  const result = await db.query(
    `INSERT INTO trailers (${fields.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${SELECT_COLS}`,
    values,
  );
  return result.rows[0];
}

// ---- PATCH TRAILER ----
export async function patchTrailer(user_id, trailer_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trailer_id) throw new ValidationError("Missing trailer_id");

  const updates = [];
  const values = [];
  let i = 1;
  for (const field of ALLOWED) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(data[field]);
      i++;
    }
  }
  if (updates.length === 0)
    throw new ValidationError("No valid fields to update");

  updates.push(`updated_at = NOW()`);
  values.push(trailer_id, user_id);

  const result = await db.query(
    `UPDATE trailers SET ${updates.join(", ")}
     WHERE trailer_id = $${i} AND user_id = $${i + 1} AND is_deleted = false
     RETURNING ${SELECT_COLS}`,
    values,
  );
  if (result.rowCount === 0) throw new NotFoundError("Trailer not found");
  return result.rows[0];
}

// ---- DELETE TRAILER (soft) ----
export async function deleteTrailer(user_id, trailer_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trailer_id) throw new ValidationError("Missing trailer_id");
  const result = await db.query(
    `UPDATE trailers
       SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
     WHERE trailer_id = $1 AND user_id = $2 AND is_deleted = false
     RETURNING trailer_id`,
    [trailer_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Trailer not found");
  return result.rows[0];
}
