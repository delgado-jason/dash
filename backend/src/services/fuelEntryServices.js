import { db } from "../../db/pool.js";
import {
  validateFuelEntryCreate,
  validateFuelEntryPatch,
  validateFuelSequence,
} from "../utils/validation/fuelValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ODO-05: the truck's latest fill dated before this one — what a new reading is
// held against. Dates come back as text so no timezone can shift them.
async function previousFill(user_id, truck_id, fuel_date, excludeId = null) {
  const result = await db.query(
    `SELECT to_char(fuel_date, 'YYYY-MM-DD') AS fuel_date, odometer_reading
       FROM fuel_entries
      WHERE user_id = $1 AND truck_id = $2 AND fuel_date < $3
        AND ($4::uuid IS NULL OR fuel_entry_id <> $4)
      ORDER BY fuel_date DESC, created_at DESC
      LIMIT 1`,
    [user_id, truck_id, fuel_date, excludeId],
  );
  return result.rows[0] ?? null;
}

// --- GET FUEL ENTRIES SERVICE
export async function getFuelEntries(user_id, truck_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  let baseQuery = `
    SELECT
      fuel_entry_id,
      truck_id,
      trip_id,
      fuel_date,
      gallons,
      price_per_gallon,
      odometer_reading,
      apu_hours,
      filled_to_top,
      company_name,
      fuel_city,
      fuel_state,
      created_at,
      updated_at
    FROM fuel_entries
  `;

  const conditions = ["user_id = $1"];
  const values = [user_id];
  let index = 2;

  if (truck_id) {
    conditions.push(`truck_id = $${index}`);
    values.push(truck_id);
    index++;
  }

  const query = `
    ${baseQuery}
    WHERE ${conditions.join(" AND ")}
    ORDER BY fuel_date DESC;
  `;

  const result = await db.query(query, values);

  return result.rows;
}

// ---- GET FUEL ENTRY SERVICE ----
export async function getFuelEntry(user_id, fuel_entry_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!fuel_entry_id) throw new ValidationError("Missing fuel_entry_id");

  const query = `
    SELECT
      fuel_entry_id,
      truck_id,
      trip_id,
      fuel_date,
      gallons,
      price_per_gallon,
      odometer_reading,
      apu_hours,
      filled_to_top,
      company_name,
      fuel_city,
      fuel_state,
      created_at,
      updated_at
    FROM fuel_entries
    WHERE user_id = $1
    AND fuel_entry_id = $2;
  `;

  const result = await db.query(query, [user_id, fuel_entry_id]);

  if (result.rowCount === 0) throw new NotFoundError("Fuel entry not found");

  return result.rows[0];
}

// ---- CREATE FUEL ENTRY SERVICE ----
export async function createFuelEntry(user_id, truck_id, trip_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!truck_id) throw new ValidationError("Missing truck_id");

  // Reject unknown fields
  const allowedFields = [
    "fuel_date",
    "gallons",
    "price_per_gallon",
    "odometer_reading",
    // The APU's hour meter, read while he's standing at the truck. Optional —
    // most fill-ups won't carry one, and a null says "not read", not "zero".
    "apu_hours",
    "company_name",
    "fuel_city",
    "fuel_state",
    // GL-154 · ticked = the tank was filled to the top; only a ticked fill
    // closes a tank window. Left out, the column default (TRUE) stands.
    "filled_to_top",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateFuelEntryCreate
  const errors = validateFuelEntryCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Confirm truck exists and belongs to user
  let result = await db.query(
    `
        SELECT 1
        FROM trucks
        WHERE user_id = $1
        AND truck_id = $2;
    `,
    [user_id, truck_id],
  );

  if (result.rowCount === 0) throw new NotFoundError("Truck not found");

  // ODO-05: a reading far below an earlier fill is a typo, not a fill.
  const seqErrors = validateFuelSequence({
    fuel_date: data.fuel_date,
    odometer_reading: data.odometer_reading,
    previous: await previousFill(user_id, truck_id, data.fuel_date),
  });
  if (seqErrors.length > 0) throw new ValidationError("Validation failed", seqErrors);

  if (trip_id) {
    // Confirm trip exists and belongs to user
    result = await db.query(
      `
        SELECT 1
        FROM trips
        WHERE user_id = $1
        AND trip_id = $2;
    `,
      [user_id, trip_id],
    );

    if (result.rowCount === 0) throw new NotFoundError("Trip not found");
  }

  let fields = ["user_id", "truck_id"];
  let values = [user_id, truck_id];
  let placeholders = ["$1", "$2"];

  let index = 3;

  if (trip_id) {
    fields.push("trip_id");
    values.push(trip_id);
    placeholders.push(`$${index}`);
    index++;
  }

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const query = `
            INSERT INTO fuel_entries(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH FUEL ENTRY SERVICE ----
export async function patchFuelEntry(user_id, fuel_entry_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!fuel_entry_id) throw new ValidationError("Missing fuel_entry_id");

  // Reject unknown fields
  const allowedFields = [
    "truck_id",
    "trip_id",
    "fuel_date",
    "gallons",
    "price_per_gallon",
    "odometer_reading",
    "apu_hours",
    "company_name",
    "fuel_city",
    "fuel_state",
    "filled_to_top",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateFuelEntryPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // ODO-05: judge a moved date or reading against the stored row and the fill
  // before it (a read; nothing is written yet).
  if (data.fuel_date !== undefined || data.odometer_reading !== undefined || data.truck_id) {
    const cur = await db.query(
      `SELECT truck_id, to_char(fuel_date, 'YYYY-MM-DD') AS fuel_date, odometer_reading
         FROM fuel_entries
        WHERE user_id = $1 AND fuel_entry_id = $2`,
      [user_id, fuel_entry_id],
    );
    if (cur.rowCount === 0) throw new NotFoundError("Fuel entry not found");
    const ex = cur.rows[0];
    const seqErrors = validateFuelSequence({
      fuel_date: data.fuel_date ?? ex.fuel_date,
      odometer_reading: data.odometer_reading ?? ex.odometer_reading,
      previous: await previousFill(
        user_id,
        data.truck_id ?? ex.truck_id,
        data.fuel_date ?? ex.fuel_date,
        fuel_entry_id,
      ),
    });
    if (seqErrors.length > 0) throw new ValidationError("Validation failed", seqErrors);
  }

  // If patching truck_id, validate
  if (data.truck_id) {
    let result = await db.query(
      `
        SELECT 1
        FROM trucks
        WHERE user_id = $1
        AND truck_id = $2;
    `,
      [user_id, data.truck_id],
    );

    if (result.rowCount === 0) throw new NotFoundError("Truck not found");
  }

  // If patching trip id
  if (data.trip_id) {
    let result = await db.query(
      `
        SELECT 1
        FROM trips
        WHERE user_id = $1
        AND trip_id = $2;
    `,
      [user_id, data.trip_id],
    );

    if (result.rowCount === 0) throw new NotFoundError("Trip not found");
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

  // Check if no fields provided
  if (updates.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  // Always update timestamp
  updates.push(`updated_at = NOW()`);

  const query = `
        UPDATE fuel_entries
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND fuel_entry_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, fuel_entry_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Fuel entry not found");
  }

  return result.rows[0];
}

// ---- DELETE FUEL ENTRY SERVICE ----
export async function deleteFuelEntry(user_id, fuel_entry_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!fuel_entry_id) throw new ValidationError("Missing fuel_entry_id");

  const query = `
        DELETE FROM fuel_entries
        WHERE user_id = $1
        AND fuel_entry_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, fuel_entry_id]);

  if (result.rowCount === 0) throw new NotFoundError("Fuel entry not found");

  return result.rows[0];
}
