import { db } from "../../db/pool.js";
import {
  validateLoadCreate,
  validateLoadPatch,
} from "../utils/validation/loadValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET LOADS SERVICE ----
export async function getLoads(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            trip_id,
            load_id,
            load_number,
            origin,
            destination,
            pickup_date,
            delivery_date,
            load_status,
            linehaul,
            fuel_surcharge,
            loaded_miles,
            mileage_source,
            payment_status,
            created_at,
            updated_at
        FROM loads
        WHERE user_id = $1
        ORDER BY pickup_date DESC;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET LOAD SERVICE ----
export async function getLoad(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  const query = `
        SELECT
            trip_id,
            load_id,
            load_number,
            origin,
            destination,
            pickup_date,
            delivery_date,
            load_status,
            linehaul,
            fuel_surcharge,
            loaded_miles,
            mileage_source,
            payment_status,
            created_at,
            updated_at
        FROM loads
        WHERE user_id = $1
        AND load_id = $2;
    `;

  const result = await db.query(query, [user_id, load_id]);

  if (result.rowCount === 0) throw new NotFoundError("Load not found");

  return result.rows[0];
}

// ---- CREATE LOAD SERVICE ----
export async function createLoad(user_id, trip_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");

  // Reject unknown fields
  const allowedFields = [
    "load_number",
    "origin",
    "destination",
    "pickup_date",
    "delivery_date",
    "load_status",
    "linehaul",
    "fuel_surcharge",
    "loaded_miles",
    "payment_status",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateLoadCreate
  const errors = validateLoadCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Confirm trip exists and belongs to user
  let result = await db.query(
    `
        SELECT 1
        FROM trips
        WHERE user_id = $1
        AND trip_id = $2;
    `,
    [user_id, trip_id],
  );

  if (result.rowCount === 0) throw new NotFoundError("Trip not found");

  const sysData = {
    ...data,
    mileage_source: "broker_confirmed",
  };

  let fields = ["user_id", "trip_id"];
  let values = [user_id, trip_id];
  let placeholders = ["$1", "$2"];

  let index = 3;

  for (const field in sysData) {
    if (sysData[field] !== undefined) {
      fields.push(field);
      values.push(sysData[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
            INSERT INTO loads(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH LOAD SERVICE ----
export async function patchLoad(user_id, load_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  // Reject unknown fields
  const allowedFields = [
    "load_number",
    "origin",
    "destination",
    "pickup_date",
    "delivery_date",
    "load_status",
    "linehaul",
    "fuel_surcharge",
    "loaded_miles",
    "payment_status",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateLoadPatch(data);

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
        UPDATE loads
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND load_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, load_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Load not found");
  }

  return result.rows[0];
}

// ---- DELETE LOAD SERVICE ----
export async function deleteLoad(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  const query = `
        DELETE FROM loads
        WHERE user_id = $1
        AND load_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, load_id]);

  if (result.rowCount === 0) throw new NotFoundError("Load not found");

  return result.rows[0];
}
