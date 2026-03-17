import { db } from "../../db/pool.js";
import {
  validateTripStopCreate,
  validateTripStopPatch,
} from "../utils/validation/tripStopsValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET TRIP STOPS SERVICE ----
export async function getTripStops(user_id, trip_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");

  const query = `
        SELECT
            stop_id,
            trip_id,
            stop_order,
            stop_type,
            stop_city,
            stop_state,
            scheduled_date,
            created_at,
            updated_at
        FROM trip_stops
        WHERE user_id = $1
        AND trip_id = $2
        ORDER BY stop_order;
    `;

  const result = await db.query(query, [user_id, trip_id]);

  return result.rows;
}

// ---- GET TRIP STOP SERVICE ----
export async function getTripStop(user_id, trip_id, stop_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");
  if (!stop_id) throw new ValidationError("Missing stop_id");

  const query = `
        SELECT
            stop_id,
            trip_id,
            stop_order,
            stop_type,
            stop_city,
            stop_state,
            scheduled_date,
            created_at,
            updated_at
        FROM trip_stops
        WHERE user_id = $1
        AND trip_id = $2
        AND stop_id = $3
    `;

  const result = await db.query(query, [user_id, trip_id, stop_id]);

  if (result.rowCount === 0) throw new NotFoundError("Stop not found");

  return result.rows[0];
}

// ---- CREATE TRIP STOP SERVICE ----
export async function createTripStop(user_id, trip_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");

  // Reject unknown fields
  const allowedFields = [
    "stop_order",
    "stop_type",
    "stop_city",
    "stop_state",
    "scheduled_date",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateTripStopCreate
  const errors = validateTripStopCreate(data);

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

  let fields = ["user_id", "trip_id"];
  let values = [user_id, trip_id];
  let placeholders = ["$1", "$2"];

  let index = 3;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
            INSERT INTO trip_stops(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH TRIP STOP SERVICE ----
export async function patchTripStop(user_id, trip_id, stop_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");
  if (!stop_id) throw new ValidationError("Missing stop_id");

  const allowedFields = [
    "stop_order",
    "stop_type",
    "stop_city",
    "stop_state",
    "scheduled_date",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateTripStopPatch(data);

  // if errors, reject request
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
        UPDATE trip_stops
        SET ${updates.join(", ")}
        WHERE trip_id = $${index}
          AND user_id = $${index + 1}
          AND stop_id = $${index + 2}
        RETURNING *;
      `;

  values.push(trip_id, user_id, stop_id);

  result = await db.query(query, values);

  if (result.rows.length === 0) {
    throw new NotFoundError("Stop not found");
  }

  return result.rows[0];
}

// ---- DELETE TRIP STOP SERVICE ----
export async function deleteTripStop(user_id, trip_id, stop_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!trip_id) throw new ValidationError("Missing trip_id");
  if (!stop_id) throw new ValidationError("Missing stop_id");

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

  const query = `
        DELETE FROM trip_stops
        WHERE trip_id = $1
        AND user_id = $2
        AND stop_id = $3
        RETURNING *;
    `;

  result = await db.query(query, [trip_id, user_id, stop_id]);

  if (result.rowCount === 0) throw new NotFoundError("Stop not found");

  return result.rows[0];
}
