import { db } from "../../db/pool.js";
import {
  validateDriverCreate,
  validateDriverPatch,
} from "../utils/validation/driverValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- CREATE DRIVER SERVICE ----

export async function createDriver(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = ["first_name", "last_name", "active"];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateDriverCreate
  const errors = validateDriverCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Insert user_id, first_name, last_name, and optional active
  let fields = ["user_id"];
  let values = [user_id];
  let placeholders = ["$1"];

  let index = 2;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
        INSERT INTO drivers(${fields.join(", ")})
        VALUES (${placeholders.join(", ")})
        RETURNING *;
    `;

  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- GET DRIVERS SERVICE ----
export async function getDrivers(user_id) {
  // Reject if missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  const result = await db.query(
    `
        SELECT
        driver_id,
        first_name,
        last_name,
        active,
        created_at,
        updated_at
        FROM drivers
        WHERE user_id = $1
        ORDER BY created_at DESC
    `,
    [user_id],
  );

  // Important: return empty array if no drivers
  return result.rows;
}

// ---- GET DRIVER SERVICE ----
export async function getDriver(user_id, driver_id) {
  // Reject if missing user_id or driver_id
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!driver_id) throw new ValidationError("Missing driver_id");

  const result = await db.query(
    `
        SELECT
        driver_id,
        first_name,
        last_name,
        active,
        created_at,
        updated_at
        FROM drivers
        WHERE user_id = $1
        AND driver_id = $2
    `,
    [user_id, driver_id],
  );

  if (result.rowCount === 0) throw new NotFoundError("Driver not found");

  return result.rows[0];
}

// ---- PATCH DRIVER SERVICE ----
export async function patchDriver(user_id, driver_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!driver_id) throw new ValidationError("Missing driver_id");

  const allowedFields = ["first_name", "last_name", "active"];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }

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
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateDriverPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Check if no fields provided
  if (updates.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  // Always update timestamp
  updates.push(`updated_at = NOW()`);

  const query = `
        UPDATE drivers
        SET ${updates.join(", ")}
        WHERE driver_id = $${index}
          AND user_id = $${index + 1}
        RETURNING *;
      `;

  values.push(driver_id, user_id);

  const result = await db.query(query, values);

  if (result.rows.length === 0) {
    throw new NotFoundError("Driver not found");
  }

  return result.rows[0];
}

// ---- DELETE DRIVER SERVICE ----
export async function deleteDriver(user_id, driver_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!driver_id) throw new ValidationError("Missing driver_id");

  const query = `
        DELETE FROM drivers
        WHERE driver_id = $1
        AND user_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [driver_id, user_id]);

  if (result.rowCount === 0) throw new NotFoundError("Driver not found");

  return result.rows[0];
}
