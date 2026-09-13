import { db } from "../../db/pool.js";
import {
  AGENCY_CREATE_FIELDS,
  AGENCY_PATCH_FIELDS,
  normalizeAgencyText,
  parseSettlementSince,
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

// ---- GET SETTLEMENT-ONLY SERVICE ----
// Freight Landstar PAID for that never became a load in dash: a trip line on a
// settlement with no load_id, carrying the posting code it was booked under.
// One row per code per load number — the grain the shelf groups by — with the
// first statement that paid it, what it paid, and the agency that owns the
// code today (NULL when nobody has named it yet; that row's `+` on the page is
// the door to naming it).
//
// The year rule lives HERE, in the query, not in the page: `since` defaults to
// Jan 1 of the account's current year, so 2025's settlements — 69 loads across
// 56 codes, all from before dash tracked anything — never reach the client.
// A load_number is required: it is the group key, and a trip line without one
// is not a load anybody can go look for.
//
// The code is resolved against the agency's WHOLE set of posting codes, not
// just its own agency_code: a settlement posted under MAM belongs to Central
// Pennsylvania (MAM is Eric's desk inside it), and matching on agency_code
// alone would hand the page an "unknown" code whose `+` offers to create a
// duplicate agency for a desk that already exists.
//
// That resolution is a correlated subquery rather than a LEFT JOIN on purpose.
// Nothing enforces that a code appears in only one agency's posting_codes —
// migration 075 §5d builds the set from the agency's own code, its agents'
// codes AND its loads' codes, so a load filed under the wrong agency (exactly
// what the code trail exists to surface) leaves the same code in two sets. A
// join would then emit the settlement line twice and DOUBLE SUM(revenue); a
// subquery returns one agency or none. The agency that owns the code outright
// wins over one that has merely posted under it.
export async function getSettlementOnly(user_id, since_param) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const { since, error } = parseSettlementSince(since_param);

  if (error) throw new ValidationError(error);

  const query = `
        SELECT
            sl.agent_code,
            sl.load_number,
            to_char(MIN(s.period_ending), 'YYYY-MM-DD') AS first_period,
            SUM(COALESCE(sl.revenue, 0)) AS revenue,
            (
              SELECT a.agency_id::text
              FROM agencies a
              WHERE a.user_id = $1
                AND (a.agency_code = sl.agent_code OR sl.agent_code = ANY(a.posting_codes))
              ORDER BY (a.agency_code = sl.agent_code) DESC, a.agency_id ASC
              LIMIT 1
            ) AS agency_id
        FROM
            settlement_lines sl
            JOIN settlements s
              ON s.settlement_id = sl.settlement_id
             AND s.user_id = $1
        WHERE sl.user_id = $1
          AND sl.kind = 'trip'
          AND sl.load_id IS NULL
          AND sl.agent_code IS NOT NULL
          AND sl.load_number IS NOT NULL
          AND s.period_ending >= $2::date
        GROUP BY sl.agent_code, sl.load_number
        ORDER BY sl.agent_code ASC, sl.load_number ASC;
    `;

  const result = await db.query(query, [user_id, since]);

  // The resolved floor rides back with the rows: the shelf prints the year it
  // is showing, and it must be the year the QUERY used, not one the page
  // guessed from its own clock.
  return { since, rows: result.rows };
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
