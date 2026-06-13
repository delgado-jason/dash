import { db } from "../../db/pool.js";
import {
  validateLoadCreate,
  validateLoadPatch,
} from "../utils/validation/loadValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET LOADS SERVICE ----
export async function getLoads(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            load_id,
            load_number,
            load_type,
            load_status,
            brokers.broker_name AS broker,
            agents.first_name || ' ' || agents.last_name AS agent,
            shipper_name,
            pickup_date,
            origin_city,
            origin_state,
            origin_market.market_name AS origin_market,
            receiver_name,
            delivery_date,
            destination_city,
            destination_state,
            destination_market.market_name AS delivery_market,
            deadhead_miles,
            loaded_miles,
            linehaul,
            fuel_surcharge,
            (SELECT COALESCE(SUM(amount), 0)
              FROM accessorials
              WHERE load_id = loads.load_id
            ) AS total_accessorials,
            commodity,
            weight,
            dimensions,
            odometer_start,
            odometer_end,
            payment_status,
            loads.created_at AS created_at,
            loads.updated_at AS updated_at
        FROM loads
        JOIN brokers
        ON loads.broker_id = brokers.broker_id
        JOIN agents
        ON loads.agent_id = agents.agent_id
        JOIN markets AS origin_market
        ON loads.origin_market_id = origin_market.market_id
        JOIN markets AS destination_market
        ON loads.destination_market_id = destination_market.market_id
        WHERE loads.user_id = $1
        ORDER BY pickup_date DESC;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET LOAD SERVICE ----
export async function getLoad(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  const query = `
        SELECT
            load_id,
            load_number,
            load_type,
            load_status,
            brokers.broker_id,
            brokers.broker_name AS broker,
            agents.agent_id,
            agents.first_name || ' ' || agents.last_name AS agent,
            agents.email AS agent_email,
            shipper_name,
            pickup_date,
            l.origin_market_id,
            origin_city,
            origin_state,
            origin_market.market_name AS origin_market,
            receiver_name,
            delivery_date,
            l.destination_market_id,
            destination_city,
            destination_state,
            destination_market.market_name AS delivery_market,
            deadhead_miles,
            loaded_miles,
            linehaul,
            fuel_surcharge,
            (SELECT COALESCE(SUM(amount), 0)
              FROM accessorials
              WHERE load_id = l.load_id
            ) AS total_accessorials,
            commodity,
            weight,
            dimensions,
            odometer_start,
            odometer_end,
            payment_status,
            l.created_at AS created_at,
            l.updated_at AS updated_at
        FROM loads AS l
        JOIN brokers
        ON l.broker_id = brokers.broker_id
        JOIN agents
        ON l.agent_id = agents.agent_id
        JOIN markets AS origin_market
        ON l.origin_market_id = origin_market.market_id
        JOIN markets AS destination_market
        ON l.destination_market_id = destination_market.market_id
        WHERE l.user_id = $1
        AND load_id = $2;
    `;

  const result = await db.query(query, [user_id, load_id]);

  if (result.rowCount === 0) throw new NotFoundError("Load not found");

  return result.rows[0];
}

// ---- CREATE LOAD SERVICE ----
export async function createLoad(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = [
    "load_number",
    "pickup_date",
    "delivery_date",
    "load_status",
    "linehaul",
    "fuel_surcharge",
    "loaded_miles",
    "payment_status",
    "load_type",
    "broker_id",
    "agent_id",
    "origin_city",
    "origin_state",
    "destination_city",
    "destination_state",
    "origin_market_id",
    "destination_market_id",
    "shipper_name",
    "receiver_name",
    "commodity",
    "weight",
    "dimensions",
    "deadhead_miles",
    "odometer_start",
    "odometer_end",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateLoadCreate
  const errors = validateLoadCreate(data);

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
            INSERT INTO loads(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH LOAD SERVICE ----
export async function patchLoad(user_id, load_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  // Reject unknown fields
  const allowedFields = [
    "load_number",
    "pickup_date",
    "delivery_date",
    "load_status",
    "linehaul",
    "fuel_surcharge",
    "loaded_miles",
    "payment_status",
    "load_type",
    "broker_id",
    "agent_id",
    "origin_city",
    "origin_state",
    "destination_city",
    "destination_state",
    "origin_market_id",
    "destination_market_id",
    "shipper_name",
    "receiver_name",
    "commodity",
    "weight",
    "dimensions",
    "deadhead_miles",
    "odometer_start",
    "odometer_end",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateLoadPatch(data);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

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
        UPDATE loads
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND load_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, load_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Load not found");
  }

  return result.rows[0];
}

// ---- DELETE LOAD SERVICE ----
export async function deleteLoad(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");

  const query = `
        DELETE FROM loads
        WHERE user_id = $1
        AND load_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, load_id]);

  if (result.rowCount === 0) throw new NotFoundError("Load not found");

  return result.rows[0];
}
