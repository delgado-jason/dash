import { db } from "../../db/pool.js";
import {
  validateTripCreate,
  validateTripPatch,
} from "../utils/validation/tripsValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// The account's single id from a query, or null unless there's exactly one — so a
// new trip auto-attributes its truck/driver (mirrors the loads/maintenance rule).
async function loneId(sql, user_id) {
  const r = await db.query(sql, [user_id]);
  return r.rowCount === 1 ? Object.values(r.rows[0])[0] : null;
}

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
            to_char(trip_date, 'YYYY-MM-DD') AS trip_date,
            trips.status,
            trips.trip_purpose,
            odometer_start,
            odometer_end,
            is_estimated,
            start_city,
            start_state,
            end_city,
            end_state,
            trips.created_at,
            trips.updated_at
        FROM trips
        LEFT JOIN trucks ON trips.truck_id = trucks.truck_id
        LEFT JOIN drivers ON trips.driver_id = drivers.driver_id
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
            to_char(trip_date, 'YYYY-MM-DD') AS trip_date,
            trips.status,
            trips.trip_purpose,
            odometer_start,
            odometer_end,
            is_estimated,
            start_city,
            start_state,
            end_city,
            end_state,
            trips.created_at,
            trips.updated_at
        FROM trips
        LEFT JOIN trucks ON trips.truck_id = trucks.truck_id
        LEFT JOIN drivers ON trips.driver_id = drivers.driver_id
        WHERE trips.user_id = $1
        AND trips.trip_id = $2;
    `;

  const result = await db.query(query, [user_id, trip_id]);

  if (result.rowCount === 0) throw new NotFoundError("Trip not found");

  return result.rows[0];
}

// ---- GET LATEST ODOMETER SERVICE ----
// Highest odometer_end across BOTH loads and trips = the truck's furthest
// recorded point. Used to prefill a new trip's odometer_start so segments tile
// (each trip starts where the last load/trip ended). GREATEST ignores NULLs
// unless every source is NULL (brand-new account) → returns null.
// NOTE: global across all trucks — correct while the operation runs ONE truck;
// scope these subqueries by truck_id if a second truck is ever added.
export async function getLatestOdometer(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT GREATEST(
            (SELECT MAX(odometer_end) FROM loads WHERE user_id = $1),
            (SELECT MAX(odometer_end) FROM trips WHERE user_id = $1)
        ) AS latest_odometer;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows[0].latest_odometer; // number | null
}

// ---- GET LAST KNOWN LOCATION SERVICE ----
// Where the truck currently sits, derived from the records that already stamp a
// location: a delivered load ends at its destination, a fuel stop at the pump,
// a trip at its end. The highest odometer among them is the furthest — and
// therefore latest — point the truck reached, so its city/state is "now".
// Trips were the blind spot until they carried an end city/state (migration 051).
// Maintenance is deliberately excluded — its location is free text, not a clean
// city/state. Used to prefill a new trip's start location. Returns null when no
// located record exists yet. Global across trucks, like getLatestOdometer.
export async function getLastKnownLocation(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT city, state FROM (
            SELECT destination_city AS city, destination_state AS state, odometer_end AS odo
                FROM loads
                WHERE user_id = $1 AND odometer_end IS NOT NULL
            UNION ALL
            SELECT fuel_city AS city, fuel_state AS state, odometer_reading AS odo
                FROM fuel_entries
                WHERE user_id = $1
            UNION ALL
            SELECT end_city AS city, end_state AS state, odometer_end AS odo
                FROM trips
                WHERE user_id = $1 AND odometer_end IS NOT NULL AND end_city IS NOT NULL
        ) located
        ORDER BY odo DESC NULLS LAST
        LIMIT 1;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows[0] ?? null; // { city, state } | null
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
    "trip_purpose",
    "odometer_start",
    "odometer_end",
    "is_estimated",
    "start_city",
    "start_state",
    "end_city",
    "end_state",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateTripCreate
  const errors = validateTripCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Auto-assign the single truck + driver when the account has exactly one, so a
  // trip is attributed like a load and its odometer counts toward the truck.
  if (data.truck_id === undefined) {
    const truckId = await loneId(
      "SELECT truck_id FROM trucks WHERE user_id = $1 AND is_deleted = false",
      user_id,
    );
    if (truckId) data.truck_id = truckId;
  }
  if (data.driver_id === undefined) {
    const driverId = await loneId(
      "SELECT driver_id FROM drivers WHERE user_id = $1 AND active = true",
      user_id,
    );
    if (driverId) data.driver_id = driverId;
  }

  // Add system fields
  const tripData = {
    ...data,
    trip_type: "deadhead",
    trip_source: "user",
    status: "completed",
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
    "start_city",
    "start_state",
    "end_city",
    "end_state",
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
