import { db } from "../../db/pool.js";
import {
  validateMarketCreate,
  validateMarketPatch,
  normalizeMarketName,
} from "../utils/validation/marketValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// The normalized-name unique index (migration 057) rejects case/whitespace
// duplicates at the DB. Translate that into a clean validation error instead of
// a 500 so the UI can show "already exists".
function rethrowDuplicate(err) {
  if (err && err.code === "23505") {
    throw new ValidationError("A market with that name already exists");
  }
  throw err;
}

// ---- GET MARKETS SERVICE ----
export async function getMarkets(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            market_id,
            market_name,
            notes,
            created_at,
            updated_at
        FROM
            markets
        WHERE user_id = $1
        ORDER BY market_name;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET MARKET SERVICE ----
export async function getMarket(user_id, market_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!market_id) throw new ValidationError("Missing market_id");

  const query = `
        SELECT
            market_id,
            market_name,
            notes,
            created_at,
            updated_at
        FROM
            markets
        WHERE user_id = $1
        AND market_id = $2;
    `;

  const result = await db.query(query, [user_id, market_id]);

  if (result.rowCount === 0) throw new NotFoundError("Market not found");

  return result.rows[0];
}

// ---- CREATE MARKET SERVICE ----
export async function createMarket(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = ["market_name", "notes"];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Canonicalize the name before validation so a blank-after-trim is still
  // caught and the stored value is the clean form.
  if (data.market_name !== undefined) {
    data.market_name = normalizeMarketName(data.market_name);
  }

  // Run validateLoadCreate
  const errors = validateMarketCreate(data);

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
            INSERT INTO markets(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  let result;
  try {
    result = await db.query(query, values);
  } catch (err) {
    rethrowDuplicate(err);
  }

  // Return created row
  return result.rows[0];
}

// ---- PATCH MARKET SERVICE ----
export async function patchMarket(user_id, market_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!market_id) throw new ValidationError("Missing market_id");

  // Reject unknown fields
  const allowedFields = ["market_name", "notes"];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }

  // Canonicalize the name before validation + storage.
  if (data.market_name !== undefined) {
    data.market_name = normalizeMarketName(data.market_name);
  }

  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateMarketPatch(data);

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
        UPDATE markets
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND market_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, market_id);

  let result;
  try {
    result = await db.query(query, values);
  } catch (err) {
    rethrowDuplicate(err);
  }

  if (result.rowCount === 0) {
    throw new NotFoundError("Market not found");
  }

  return result.rows[0];
}

// ---- DELETE MARKET SERVICE ----
export async function deleteMarket(user_id, market_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!market_id) throw new ValidationError("Missing market_id");

  const query = `
        DELETE FROM markets
        WHERE user_id = $1
        AND market_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, market_id]);

  if (result.rowCount === 0) throw new NotFoundError("Market not found");

  return result.rows[0];
}
