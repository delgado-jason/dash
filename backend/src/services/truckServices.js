import { db } from "../../db/pool.js";
import {
  validateTruckCreate,
  validateTruckPatch,
} from "../utils/validation/truckValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET ALL TRUCKS ----

export async function getTrucks(user_id) {
  if (!user_id) {
    throw new ValidationError("Missing user_id");
  }

  const result = await db.query(
    `
    SELECT
      truck_id,
      unit_number,
      truck_name,
      vin,
      plate_number,
      plate_state,
      make,
      model,
      year,
      current_odometer,
      status,
      in_service_date,
      is_deleted,
      created_at,
      updated_at,
      deleted_at
    FROM public.trucks
    WHERE user_id = $1
    AND is_deleted = false
    ORDER BY created_at DESC
    `,
    [user_id],
  );

  // Important: return empty array if no trucks
  return result.rows;
}

// ---- GET TRUCK BY ID ----

export async function getTruck(user_id, truck_id) {
  if (!user_id) {
    throw new ValidationError("Missing user_id");
  }

  if (!truck_id) {
    throw new ValidationError("Missing truck_id");
  }

  const result = await db.query(
    `
    SELECT
      truck_id,
      truck_name,
      unit_number,
      vin,
      plate_number,
      plate_state,
      make,
      model,
      year,
      current_odometer,
      status,
      in_service_date,
      is_deleted,
      created_at,
      updated_at,
      deleted_at
    FROM public.trucks
    WHERE user_id = $1
    AND truck_id = $2
    AND is_deleted = false
    `,
    [user_id, truck_id],
  );

  if (result.rowCount === 0) throw new NotFoundError("Truck not found");

  return result.rows[0];
}

// ---- CREATE TRUCK ----

export async function createTruck(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const allowedFields = [
    "unit_number",
    "vin",
    "plate_number",
    "plate_state",
    "make",
    "model",
    "year",
    "current_odometer",
    "status",
    "in_service_date",
    "truck_name",
  ];

  // Filter for allowed fields only
  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} is not allowed`);
    }
  }

  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateTruckCreate(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const fields = ["user_id"];
  let values = [user_id];
  const placeholders = ["$1"];

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
    INSERT INTO trucks (${fields.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *;
  `;

  const result = await db.query(query, values);

  return result.rows[0];
}

// ---- PATCH TRUCK ----

export async function patchTruck(user_id, truck_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!truck_id) throw new ValidationError("Missing truck_id");

  const allowedFields = [
    "unit_number",
    "vin",
    "plate_number",
    "plate_state",
    "make",
    "model",
    "year",
    "current_odometer",
    "status",
    "in_service_date",
    "truck_name",
  ];

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
  const errors = validateTruckPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Always update timestamp
  updates.push(`updated_at = NOW()`);

  const query = `
    UPDATE trucks
    SET ${updates.join(", ")}
    WHERE truck_id = $${index}
      AND user_id = $${index + 1}
      AND is_deleted = false
    RETURNING *;
  `;

  values.push(truck_id, user_id);

  const result = await db.query(query, values);

  if (result.rows.length === 0) {
    throw new NotFoundError("Truck not found");
  }

  return result.rows[0];
}

// ---- DELETE TRUCK ----
export async function deleteTruck(user_id, truck_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!truck_id) throw new ValidationError("Missing truck_id");

  const query = `
    UPDATE trucks
    SET 
      is_deleted = true,
      deleted_at = NOW(),
      updated_at = NOW()
    WHERE truck_id = $1
      AND user_id = $2
      AND is_deleted = false
    RETURNING *;
  `;

  const result = await db.query(query, [truck_id, user_id]);

  if (result.rowCount === 0) throw new NotFoundError("Truck not found");

  return result.rows[0];
}
