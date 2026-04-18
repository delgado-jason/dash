import { db } from "../../db/pool.js";
import {
  validateBrokerCreate,
  validateBrokerPatch,
} from "../utils/validation/brokerValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET BROKERS SERVICE ----
export async function getBrokers(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            broker_id,
            broker_name,
            phone,
            email,
            rating,
            notes,
            created_at,
            updated_at
        FROM
            brokers
        WHERE user_id = $1
        ORDER BY broker_name DESC;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET BROKER SERVICE ----
export async function getBroker(user_id, broker_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!broker_id) throw new ValidationError("Missing broker_id");

  const query = `
        SELECT
            broker_id,
            broker_name,
            phone,
            email,
            rating,
            notes,
            created_at,
            updated_at
        FROM
            brokers
        WHERE user_id = $1
        AND broker_id = $2;
    `;

  const result = await db.query(query, [user_id, broker_id]);

  if (result.rowCount === 0) throw new NotFoundError("Broker not found");

  return result.rows[0];
}

// ---- CREATE BROKER SERVICE ----
export async function createBroker(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = ["broker_name", "phone", "email", "rating", "notes"];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateLoadCreate
  const errors = validateBrokerCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  let fields = ["user_id"];
  let values = [user_id];
  let placeholders = ["$1"];

  let index = 2;

  for (const field in data) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
            INSERT INTO brokers(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH BROKER SERVICE ----
export async function patchBroker(user_id, broker_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!broker_id) throw new ValidationError("Missing broker_id");

  // Reject unknown fields
  const allowedFields = ["broker_name", "phone", "email", "rating", "notes"];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateBrokerPatch(data);

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
        UPDATE brokers
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND broker_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, broker_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Broker not found");
  }

  return result.rows[0];
}

// ---- DELETE BROKER SERVICE ----
export async function deleteBroker(user_id, broker_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!broker_id) throw new ValidationError("Missing broker_id");

  const query = `
        DELETE FROM brokers
        WHERE user_id = $1
        AND broker_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, broker_id]);

  if (result.rowCount === 0) throw new NotFoundError("Broker not found");

  return result.rows[0];
}
