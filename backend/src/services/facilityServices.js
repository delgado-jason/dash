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
        SELECT facility_id, name, city, state, address, notes, created_at, updated_at
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

  const allowedFields = ["name", "city", "state", "address", "notes"];
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
        INSERT INTO facilities (user_id, name, city, state, address, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, name, city, state)
        DO UPDATE SET updated_at = NOW()
        RETURNING *;
    `;
  const values = [
    user_id,
    clean.name,
    clean.city,
    clean.state,
    clean.address ?? null,
    clean.notes ?? null,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// ---- PATCH FACILITY SERVICE ----
export async function patchFacility(user_id, facility_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!facility_id) throw new ValidationError("Missing facility_id");

  const allowedFields = ["name", "city", "state", "address", "notes"];
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
