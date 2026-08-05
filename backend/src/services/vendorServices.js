import { db } from "../../db/pool.js";
import {
  validateVendorCreate,
  validateVendorPatch,
} from "../utils/validation/vendorValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// The writable columns (user_id is always set from the token, never the body).
const VENDOR_FIELDS = [
  "name",
  "category",
  "rating",
  "contact_name",
  "phone",
  "email",
  "website",
  "city",
  "state",
  "service_area",
  "status",
  "notes",
];

// Shop vendors get a spend readout derived from the maintenance log, matched by
// name (the maintenance vendor field is free text — no FK yet). Gated to category
// 'Shop' so a coincidental name match can't attribute shop spend to an escort.
// SUM(cost) is numeric → serialized as a string; service_count is a real integer.
const SPEND_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      SUM(m.cost)            AS total_spend,
      COUNT(*)::int          AS service_count,
      MAX(m.service_date)    AS last_service
    FROM maintenance_services m
    WHERE m.user_id = v.user_id
      AND v.category = 'Shop'
      AND LOWER(TRIM(m.vendor)) = LOWER(TRIM(v.name))
  ) spend ON TRUE
`;

const VENDOR_COLUMNS = `
  v.vendor_id,
  v.name,
  v.category,
  v.rating,
  v.contact_name,
  v.phone,
  v.email,
  v.website,
  v.city,
  v.state,
  v.service_area,
  v.status,
  v.notes,
  v.created_at,
  v.updated_at,
  spend.total_spend,
  spend.service_count,
  spend.last_service
`;

// ---- GET VENDORS SERVICE ----
export async function getVendors(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
    SELECT ${VENDOR_COLUMNS}
    FROM vendors v
    ${SPEND_JOIN}
    WHERE v.user_id = $1
    ORDER BY v.name;
  `;

  const result = await db.query(query, [user_id]);
  return result.rows;
}

// ---- GET VENDOR SERVICE ----
export async function getVendor(user_id, vendor_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  const vendorQuery = `
    SELECT ${VENDOR_COLUMNS}
    FROM vendors v
    ${SPEND_JOIN}
    WHERE v.user_id = $1
    AND v.vendor_id = $2;
  `;

  const vendorResult = await db.query(vendorQuery, [user_id, vendor_id]);
  if (vendorResult.rowCount === 0) throw new NotFoundError("Vendor not found");

  const ratingHistoryResult = await db.query(
    `SELECT * FROM vendor_rating_history WHERE vendor_id = $1 ORDER BY changed_at DESC;`,
    [vendor_id],
  );

  return {
    vendor: vendorResult.rows[0],
    ratingHistory: ratingHistoryResult.rows,
  };
}

// ---- CREATE VENDOR SERVICE ----
export async function createVendor(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  for (const field in data) {
    if (!VENDOR_FIELDS.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  const errors = validateVendorCreate(data);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const fields = ["user_id"];
  const values = [user_id];
  const placeholders = ["$1"];
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
    INSERT INTO vendors(${fields.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *;
  `;

  const result = await db.query(query, values);
  return result.rows[0];
}

// ---- PATCH VENDOR SERVICE ----
export async function patchVendor(user_id, vendor_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  // Pull audit fields off — they aren't vendor columns.
  const { reason, changed_by, ...vendorData } = data;

  for (const field in vendorData) {
    if (!VENDOR_FIELDS.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }

  const errors = validateVendorPatch(vendorData);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const updates = [];
  const values = [];
  let index = 1;

  for (const field of VENDOR_FIELDS) {
    if (vendorData[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(vendorData[field]);
      index++;
    }
  }

  if (updates.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  updates.push(`updated_at = NOW()`);

  const ratingIsChanging = vendorData.rating !== undefined;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // Read the old rating FIRST, on the same client, so the history is accurate.
    let oldRating = null;
    if (ratingIsChanging) {
      const current = await client.query(
        `SELECT rating FROM vendors WHERE user_id=$1 AND vendor_id=$2`,
        [user_id, vendor_id],
      );
      if (current.rowCount === 0) throw new NotFoundError("Vendor not found");
      oldRating = current.rows[0].rating;
    }

    const query = `
      UPDATE vendors
      SET ${updates.join(", ")}
      WHERE user_id = $${index}
        AND vendor_id = $${index + 1}
      RETURNING *;
    `;
    const updateValues = [...values, user_id, vendor_id];
    const result = await client.query(query, updateValues);
    if (result.rowCount === 0) throw new NotFoundError("Vendor not found");

    // Only record history if the rating ACTUALLY changed.
    if (ratingIsChanging && vendorData.rating !== oldRating) {
      if (!reason || !changed_by) {
        throw new ValidationError(
          "Rating changes require a reason and initials",
        );
      }
      const historyResult = await client.query(
        `INSERT INTO vendor_rating_history(vendor_id, old_rating, new_rating, reason, changed_by)
         VALUES($1, $2, $3, $4, $5)
         RETURNING *;`,
        [vendor_id, oldRating, vendorData.rating, reason, changed_by],
      );
      if (historyResult.rowCount === 0)
        throw new Error("Unable to record rating change");
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---- DELETE VENDOR SERVICE ----
export async function deleteVendor(user_id, vendor_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  const query = `
    DELETE FROM vendors
    WHERE user_id = $1
    AND vendor_id = $2
    RETURNING *;
  `;

  const result = await db.query(query, [user_id, vendor_id]);
  if (result.rowCount === 0) throw new NotFoundError("Vendor not found");

  return result.rows[0];
}
