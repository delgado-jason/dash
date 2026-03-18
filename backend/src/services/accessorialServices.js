import { db } from "../../db/pool.js";
import {
  validateAccessorialCreate,
  validateAccessorialPatch,
} from "../utils/validation/accessorialValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET ACCESSORIALS SERVICE ----
export async function getAccessorials(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  const query = `
        SELECT
            accessorial_id,
            load_id,
            accessorial_type,
            amount,
            created_at,
            updated_at
        FROM accessorials
        WHERE user_id = $1
        AND load_id = $2
        ORDER BY amount DESC;
    `;

  const result = await db.query(query, [user_id, load_id]);

  return result.rows;
}

// ---- CREATE ACCESSORIAL SERVICE ----
export async function createAccessorial(user_id, load_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  // Reject unknown fields
  const allowedFields = ["accessorial_type", "amount"];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateAccessorialCreate
  const errors = validateAccessorialCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Confirm load exists and belongs to user
  let result = await db.query(
    `
        SELECT 1
        FROM loads
        WHERE user_id = $1
        AND load_id = $2;
    `,
    [user_id, load_id],
  );

  if (result.rowCount === 0) throw new NotFoundError("Load not found");

  let fields = ["user_id", "load_id"];
  let values = [user_id, load_id];
  let placeholders = ["$1", "$2"];

  let index = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
            INSERT INTO accessorials(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH ACCESSORIAL SERVICE ----
export async function patchAccessorial(user_id, accessorial_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!accessorial_id) throw new ValidationError("Missing accessorial_id");

  // Reject unknown fields
  const allowedFields = ["accessorial_type", "amount"];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateAccessorialPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const updates = [];
  const values = [];
  let index = 1;

  // Filter allowed fields
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(data[field]);
      index++;
    }
  }

  // Check if no fields provided
  if (updates.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  // Always update timestamp
  updates.push(`updated_at = NOW()`);

  const query = `
        UPDATE accessorials
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND accessorial_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, accessorial_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Accessorial not found");
  }

  return result.rows[0];
}

// ---- DELETE ACCESSORIAL SERVICE ----
export async function deleteAccessorial(user_id, accessorial_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!accessorial_id) throw new ValidationError("Missing accessorial_id");

  const query = `
        DELETE FROM accessorials
        WHERE user_id = $1
        AND accessorial_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, accessorial_id]);

  if (result.rowCount === 0) throw new NotFoundError("Accessorial not found");

  return result.rows[0];
}
