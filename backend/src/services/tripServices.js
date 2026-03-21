import { db } from "../../db/pool.js";
import {
  validateTripCreate,
  validateTripPatch,
} from "../utils/validation/tripsValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET TRIPS SERVICE ----
export async function getTrips(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            trip_id,
            trip_number,
            trips.truck_id,
            trucks.unit_number,
            trips.driver_id,
            drivers.first_name AS driver_name,
            trip_type,
            trip_source,
            trip_date,
            trips.status,
            odometer_start,
            odometer_end,
            is_estimated,
            trips.created_at,
            trips.updated_at
        FROM trips
        JOIN trucks ON trips.truck_id = trucks.truck_id
        JOIN drivers ON trips.driver_id = drivers.driver_id
        WHERE trips.user_id = $1
        ORDER BY trip_date DESC;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET TRIP SERVICE ----
export async function getTrip(user_id, trip_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");

  const query = `
        SELECT
            trip_id,
            trip_number,
            trips.truck_id,
            trucks.unit_number,
            trips.driver_id,
            drivers.first_name AS driver_name,
            trip_type,
            trip_source,
            trip_date,
            trips.status,
            odometer_start,
            odometer_end,
            is_estimated,
            trips.created_at,
            trips.updated_at
        FROM trips
        JOIN trucks ON trips.truck_id = trucks.truck_id
        JOIN drivers ON trips.driver_id = drivers.driver_id
        WHERE trips.user_id = $1
        AND trips.trip_id = $2;
    `;

  const result = await db.query(query, [user_id, trip_id]);

  if (result.rowCount === 0) throw new NotFoundError("Trip not found");

  return result.rows[0];
}

// ---- CREATE TRIP SERVICE ----
export async function createTrip(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = [
    "truck_id",
    "driver_id",
    "trip_date",
    "odometer_start",
    "odometer_end",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateTripCreate
  const errors = validateTripCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Add system fields
  const tripData = {
    ...data,
    trip_type: "revenue",
    trip_source: "user",
    status: "planned",
  };

  let fields = ["user_id"];
  let values = [user_id];
  let placeholders = ["$1"];

  let index = 2;

  for (const field in tripData) {
    if (tripData[field] !== undefined) {
      fields.push(field);
      values.push(tripData[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
            INSERT INTO trips(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH TRIP SERVICE ----
export async function patchTrip(user_id, trip_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");

  const allowedFields = [
    "truck_id",
    "driver_id",
    "trip_date",
    "odometer_start",
    "odometer_end",
  ];

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
  const errors = validateTripPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Check if no fields provided
  if (updates.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  // Always update timestamp
  updates.push(`updated_at = NOW()`);

  const query = `
        UPDATE trips
        SET ${updates.join(", ")}
        WHERE trip_id = $${index}
          AND user_id = $${index + 1}
        RETURNING *;
      `;

  values.push(trip_id, user_id);

  const result = await db.query(query, values);

  if (result.rows.length === 0) {
    throw new NotFoundError("Trip not found");
  }

  return result.rows[0];
}

// ---- DELETE TRIP SERVICE ----
export async function deleteTrip(user_id, trip_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");

  const query = `
        DELETE FROM trips
        WHERE trip_id = $1
        AND user_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [trip_id, user_id]);

  if (result.rowCount === 0) throw new NotFoundError("Trip not found");

  return result.rows[0];
}
