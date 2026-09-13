import { db } from "../../db/pool.js";
import {
  AGENCY_CREATE_FIELDS,
  AGENCY_PATCH_FIELDS,
  normalizeAgencyText,
  validateAgencyCreate,
  validateAgencyPatch,
} from "../utils/validation/agencyValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET AGENCIES SERVICE ----
// Ordered by name, then code: the named agencies read as a book, and the ones
// the bills haven't named yet (name IS NULL) fall to the end in code order.
export async function getAgencies(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            agency_id,
            user_id,
            agency_code,
            name,
            posting_codes,
            phone,
            email,
            rating,
            notes,
            created_at,
            updated_at
        FROM
            agencies
        WHERE user_id = $1
        ORDER BY name ASC NULLS LAST, agency_code ASC;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET AGENCY SERVICE ----
export async function getAgency(user_id, agency_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agency_id) throw new ValidationError("Missing agency_id");

  const query = `
        SELECT
            agency_id,
            user_id,
            agency_code,
            name,
            posting_codes,
            phone,
            email,
            rating,
            notes,
            created_at,
            updated_at
        FROM
            agencies
        WHERE user_id = $1
        AND agency_id = $2;
    `;

  const result = await db.query(query, [user_id, agency_id]);

  if (result.rowCount === 0) throw new NotFoundError("Agency not found");

  return result.rows[0];
}

// ---- CREATE AGENCY SERVICE ----
export async function createAgency(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields — the whitelist lives beside the rules that judge
  // them (agencyValidation), so the two can never drift.
  for (const field in data) {
    if (!AGENCY_CREATE_FIELDS.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Normalize BEFORE validating and before the write: the rules measure the
  // trimmed, uppercased value, so that is what the row has to store.
  // posting_codes is deliberately not an allowed field — it is evidence the
  // settlement feed appends to, never something a client writes.
  normalizeAgencyText(data);

  // Run validateAgencyCreate
  const errors = validateAgencyCreate(data);

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
            INSERT INTO agencies(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  // unique_agency_code_per_user turns a repeat code into a 23505 — the route
  // answers that with a 409, not a 500.
  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH AGENCY SERVICE ----
export async function patchAgency(user_id, agency_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agency_id) throw new ValidationError("Missing agency_id");

  // Throw error if data contains invalid field(s) — same whitelist source as
  // create, exported from agencyValidation beside the rules.
  for (const field in data) {
    if (!AGENCY_PATCH_FIELDS.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Same normalization as create — a blank name here CLEARS the name (NULL),
  // and a lowercase code is upper-cased rather than refused.
  normalizeAgencyText(data);

  // Must pass validation checks before query request
  const errors = validateAgencyPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const updates = [];
  const values = [];
  let index = 1;

  // Filter allowed fields
  for (const field of AGENCY_PATCH_FIELDS) {
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
        UPDATE agencies
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND agency_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, agency_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Agency not found");
  }

  return result.rows[0];
}

// ---- DELETE AGENCY SERVICE ----
export async function deleteAgency(user_id, agency_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agency_id) throw new ValidationError("Missing agency_id");

  const query = `
        DELETE FROM agencies
        WHERE user_id = $1
        AND agency_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, agency_id]);

  if (result.rowCount === 0) throw new NotFoundError("Agency not found");

  return result.rows[0];
}
