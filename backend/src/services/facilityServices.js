import { db } from "../../db/pool.js";
import {
  validateFacilityCreate,
  validateFacilityPatch,
} from "../utils/validation/facilityValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// Normalize the identity fields so dedup is consistent: trim name/city, and
// upper-case the 2-letter state.
const norm = (data) => {
  const out = { ...data };
  if (typeof out.name === "string") out.name = out.name.trim();
  if (typeof out.city === "string") out.city = out.city.trim();
  if (typeof out.state === "string") out.state = out.state.trim().toUpperCase();
  if (typeof out.address === "string") out.address = out.address.trim() || null;
  return out;
};

// ---- GET FACILITIES SERVICE ---- (with per-facility load counts by role)
export async function getFacilities(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            f.facility_id,
            f.name,
            f.kind,
            f.city,
            f.state,
            f.address,
            f.notes,
            f.created_at,
            f.updated_at,
            (SELECT COUNT(*)::int FROM loads WHERE shipper_facility_id = f.facility_id) AS as_shipper,
            (SELECT COUNT(*)::int FROM loads WHERE receiver_facility_id = f.facility_id) AS as_receiver
        FROM facilities f
        WHERE f.user_id = $1
        ORDER BY f.name;
    `;

  const result = await db.query(query, [user_id]);
  return result.rows;
}

// ---- GET FACILITY SERVICE ----
export async function getFacility(user_id, facility_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!facility_id) throw new ValidationError("Missing facility_id");

  const query = `
        SELECT facility_id, name, kind, city, state, address, notes, created_at, updated_at
        FROM facilities
        WHERE user_id = $1 AND facility_id = $2;
    `;

  const result = await db.query(query, [user_id, facility_id]);
  if (result.rowCount === 0) throw new NotFoundError("Facility not found");
  return result.rows[0];
}

// ---- CREATE FACILITY SERVICE ---- (find-or-create on name + city + state)
export async function createFacility(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const allowedFields = ["name", "kind", "city", "state", "address", "notes"];
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }

  const clean = norm(data);
  const errors = validateFacilityCreate(clean);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // On a name+city+state collision, return the existing facility rather than
  // erroring or duplicating — picking "the same dock" should just find it.
  const query = `
        INSERT INTO facilities (user_id, name, city, state, address, notes, kind)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, name, city, state)
        DO UPDATE SET updated_at = NOW()
        RETURNING *;
    `;
  const values = [
    user_id,
    clean.name ?? null,
    clean.city,
    clean.state,
    clean.address ?? null,
    clean.notes ?? null,
    clean.kind ?? "business",
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// ---- PATCH FACILITY SERVICE ----
export async function patchFacility(user_id, facility_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!facility_id) throw new ValidationError("Missing facility_id");

  const allowedFields = ["name", "kind", "city", "state", "address", "notes"];
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }

  const clean = norm(data);
  const errors = validateFacilityPatch(clean);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const updates = [];
  const values = [];
  let index = 1;
  for (const field of allowedFields) {
    if (clean[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(clean[field]);
      index++;
    }
  }
  if (updates.length === 0)
    throw new ValidationError("No valid fields provided for update");

  updates.push(`updated_at = NOW()`);

  const query = `
        UPDATE facilities
        SET ${updates.join(", ")}
        WHERE user_id = $${index} AND facility_id = $${index + 1}
        RETURNING *;
    `;
  values.push(user_id, facility_id);

  const result = await db.query(query, values);
  if (result.rowCount === 0) throw new NotFoundError("Facility not found");
  return result.rows[0];
}

// ---- MERGE FACILITIES ---- (fold duplicates into one keeper, atomically)
// Reassigns every load off the merged facilities onto the keeper, then deletes
// the duplicates — all in one transaction so it can't half-apply.
export async function mergeFacilities(user_id, keeper_id, merge_ids) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!keeper_id) throw new ValidationError("Missing keeper_id");
  if (!Array.isArray(merge_ids) || merge_ids.length === 0)
    throw new ValidationError("Provide at least one facility to merge");
  if (merge_ids.includes(keeper_id))
    throw new ValidationError("The keeper can't also be in the merge list");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // Every id (keeper + merges) must belong to this user.
    const ids = [keeper_id, ...merge_ids];
    const owned = await client.query(
      `SELECT facility_id FROM facilities WHERE user_id = $1 AND facility_id = ANY($2::uuid[])`,
      [user_id, ids],
    );
    if (owned.rowCount !== ids.length)
      throw new NotFoundError("One or more facilities not found");

    const s = await client.query(
      `UPDATE loads SET shipper_facility_id = $1
         WHERE user_id = $2 AND shipper_facility_id = ANY($3::uuid[])`,
      [keeper_id, user_id, merge_ids],
    );
    const r = await client.query(
      `UPDATE loads SET receiver_facility_id = $1
         WHERE user_id = $2 AND receiver_facility_id = ANY($3::uuid[])`,
      [keeper_id, user_id, merge_ids],
    );
    const d = await client.query(
      `DELETE FROM facilities WHERE user_id = $1 AND facility_id = ANY($2::uuid[])`,
      [user_id, merge_ids],
    );

    await client.query("COMMIT");
    return {
      keeper_id,
      merged: d.rowCount,
      loads_reassigned: s.rowCount + r.rowCount,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---- DELETE FACILITY SERVICE ---- (loads keep their history; link goes null)
export async function deleteFacility(user_id, facility_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!facility_id) throw new ValidationError("Missing facility_id");

  const query = `
        DELETE FROM facilities
        WHERE user_id = $1 AND facility_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, facility_id]);
  if (result.rowCount === 0) throw new NotFoundError("Facility not found");
  return result.rows[0];
}
