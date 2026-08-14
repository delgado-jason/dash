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
            loads.agent_id,
            brokers.broker_name AS broker,
            agents.first_name || ' ' || agents.last_name AS agent,
            shipper_name,
            shipper_facility_id,
            shipper_in,
            shipper_out,
            pickup_appt_start,
            pickup_appt_end,
            pickup_date,
            origin_city,
            origin_state,
            loads.origin_market_id,
            origin_market.market_name AS origin_market,
            receiver_name,
            receiver_facility_id,
            receiver_in,
            receiver_out,
            delivery_appt_start,
            delivery_appt_end,
            delivery_date,
            destination_city,
            destination_state,
            loads.destination_market_id,
            destination_market.market_name AS delivery_market,
            detention_paid,
            detention_billable,
            tonu_paid,
            deadhead_miles,
            loaded_miles,
            linehaul,
            fuel_surcharge,
            (SELECT COALESCE(SUM(amount), 0)
              FROM accessorials
              WHERE load_id = loads.load_id
            ) AS total_accessorials,
            linehaul + fuel_surcharge
              + (SELECT COALESCE(SUM(amount), 0) FROM accessorials WHERE load_id = loads.load_id)
              AS gross_revenue,
            ROUND(
              linehaul * (COALESCE(ss.linehaul_pct, 1) + COALESCE(ss.trailer_pct, 0))
              + fuel_surcharge * COALESCE(ss.fuel_surcharge_pct, 1)
              + (SELECT COALESCE(SUM(
                     a.amount * COALESCE(apr.pay_pct, COALESCE(ss.accessorial_pct, 1))
                   ), 0)
                 FROM accessorials a
                 LEFT JOIN accessorial_pay_rates apr
                   ON apr.user_id = loads.user_id
                   AND apr.accessorial_type = a.accessorial_type
                 WHERE a.load_id = loads.load_id)
            , 2) AS net_revenue,
            -- The trailer's cut: its % of linehaul plus its % of the base-rate
            -- accessorials it rides on (those paid at linehaul_pct + trailer_pct).
            -- FSC and flat-100% accessorials belong to the tractor, not the trailer.
            ROUND(
              linehaul * COALESCE(ss.trailer_pct, 0)
              + COALESCE(ss.trailer_pct, 0) * (
                  SELECT COALESCE(SUM(a.amount), 0)
                  FROM accessorials a
                  LEFT JOIN accessorial_pay_rates apr
                    ON apr.user_id = loads.user_id
                    AND apr.accessorial_type = a.accessorial_type
                  WHERE a.load_id = loads.load_id
                    AND COALESCE(apr.pay_pct, COALESCE(ss.accessorial_pct, 1))
                        = COALESCE(ss.linehaul_pct, 1) + COALESCE(ss.trailer_pct, 0))
            , 2) AS trailer_net,
            commodity,
            weight,
            length_in,
            width_in,
            height_in,
            odometer_start,
            odometer_end,
            payment_status,
            loads.truck_id,
            loads.driver_id,
            loads.trailer_id,
            loads.booked_by,
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
        LEFT JOIN settlement_schedules AS ss
        ON ss.user_id = loads.user_id
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
            shipper_facility_id,
            shipper_in,
            shipper_out,
            pickup_appt_start,
            pickup_appt_end,
            pickup_date,
            l.origin_market_id,
            origin_city,
            origin_state,
            origin_market.market_name AS origin_market,
            receiver_name,
            receiver_facility_id,
            receiver_in,
            receiver_out,
            delivery_appt_start,
            delivery_appt_end,
            delivery_date,
            l.destination_market_id,
            destination_city,
            destination_state,
            destination_market.market_name AS delivery_market,
            detention_paid,
            detention_billable,
            tonu_paid,
            deadhead_miles,
            loaded_miles,
            linehaul,
            fuel_surcharge,
            (SELECT COALESCE(SUM(amount), 0)
              FROM accessorials
              WHERE load_id = l.load_id
            ) AS total_accessorials,
            linehaul + fuel_surcharge
              + (SELECT COALESCE(SUM(amount), 0) FROM accessorials WHERE load_id = l.load_id)
              AS gross_revenue,
            ROUND(
              linehaul * (COALESCE(ss.linehaul_pct, 1) + COALESCE(ss.trailer_pct, 0))
              + fuel_surcharge * COALESCE(ss.fuel_surcharge_pct, 1)
              + (SELECT COALESCE(SUM(
                     a.amount * COALESCE(apr.pay_pct, COALESCE(ss.accessorial_pct, 1))
                   ), 0)
                 FROM accessorials a
                 LEFT JOIN accessorial_pay_rates apr
                   ON apr.user_id = l.user_id
                   AND apr.accessorial_type = a.accessorial_type
                 WHERE a.load_id = l.load_id)
            , 2) AS net_revenue,
            -- The trailer's cut: its % of linehaul plus its % of the base-rate
            -- accessorials it rides on (those paid at linehaul_pct + trailer_pct).
            -- FSC and flat-100% accessorials belong to the tractor, not the trailer.
            ROUND(
              linehaul * COALESCE(ss.trailer_pct, 0)
              + COALESCE(ss.trailer_pct, 0) * (
                  SELECT COALESCE(SUM(a.amount), 0)
                  FROM accessorials a
                  LEFT JOIN accessorial_pay_rates apr
                    ON apr.user_id = l.user_id
                    AND apr.accessorial_type = a.accessorial_type
                  WHERE a.load_id = l.load_id
                    AND COALESCE(apr.pay_pct, COALESCE(ss.accessorial_pct, 1))
                        = COALESCE(ss.linehaul_pct, 1) + COALESCE(ss.trailer_pct, 0))
            , 2) AS trailer_net,
            commodity,
            weight,
            length_in,
            width_in,
            height_in,
            odometer_start,
            odometer_end,
            payment_status,
            l.truck_id,
            l.driver_id,
            l.trailer_id,
            l.booked_by,
            COALESCE(
              bu.display_name,
              NULLIF(TRIM(COALESCE(bp.first_name, '') || ' ' || COALESCE(bp.last_name, '')), ''),
              bu.email
            ) AS booked_by_name,
            trk.unit_number AS truck_unit,
            drv.first_name || ' ' || drv.last_name AS driver_name,
            trl.unit_number AS trailer_unit,
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
        LEFT JOIN trucks AS trk
        ON l.truck_id = trk.truck_id
        LEFT JOIN drivers AS drv
        ON l.driver_id = drv.driver_id
        LEFT JOIN trailers AS trl
        ON l.trailer_id = trl.trailer_id
        LEFT JOIN settlement_schedules AS ss
        ON ss.user_id = l.user_id
        LEFT JOIN users AS bu
        ON bu.user_id = l.booked_by
        LEFT JOIN profiles AS bp
        ON bp.user_id = l.booked_by
        WHERE l.user_id = $1
        AND load_id = $2;
    `;

  const result = await db.query(query, [user_id, load_id]);

  if (result.rowCount === 0) throw new NotFoundError("Load not found");

  return result.rows[0];
}

// ---- CREATE LOAD SERVICE ----
// A load's booker defaults to the ACCOUNT OWNER (user_id === account_id), not
// whoever enters it: in this owner-operator shop the owner does the booking and
// a training dispatcher just logs the loads. The client sends booked_by
// explicitly (the "Booked by" picker, default = owner) and anyone can reassign
// it per-load. `self_id` (the logged-in person) is accepted for caller parity.
export async function createLoad(user_id, data, self_id) {
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
    "shipper_facility_id",
    "shipper_in",
    "shipper_out",
    "pickup_appt_start",
    "pickup_appt_end",
    "receiver_name",
    "receiver_facility_id",
    "receiver_in",
    "receiver_out",
    "delivery_appt_start",
    "delivery_appt_end",
    "detention_paid",
    "detention_billable",
    "tonu_paid",
    "commodity",
    "weight",
    "length_in",
    "width_in",
    "height_in",
    "deadhead_miles",
    "odometer_start",
    "odometer_end",
    "truck_id",
    "driver_id",
    "trailer_id",
    "booked_by",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateLoadCreate
  const errors = validateLoadCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // Booker: explicit override (the "Booked by" picker), else the account owner.
  const booker = data.booked_by ?? user_id;
  let fields = ["user_id", "booked_by"];
  let values = [user_id, booker];
  let placeholders = ["$1", "$2"];

  let index = 3;

  for (const field in data) {
    if (field === "booked_by") continue; // seeded above
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
    "shipper_facility_id",
    "shipper_in",
    "shipper_out",
    "pickup_appt_start",
    "pickup_appt_end",
    "receiver_name",
    "receiver_facility_id",
    "receiver_in",
    "receiver_out",
    "delivery_appt_start",
    "delivery_appt_end",
    "detention_paid",
    "detention_billable",
    "tonu_paid",
    "commodity",
    "weight",
    "length_in",
    "width_in",
    "height_in",
    "deadhead_miles",
    "odometer_start",
    "odometer_end",
    "truck_id",
    "driver_id",
    "trailer_id",
    "booked_by",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // A PATCH may move only one of the two dates, so the date-order check needs
  // the stored row to compare against. Pulled as text (to_char) so the dates
  // never round-trip through a JS Date and pick up a timezone shift.
  let existingDates = {};
  if (data.pickup_date !== undefined || data.delivery_date !== undefined) {
    const current = await db.query(
      `SELECT to_char(pickup_date, 'YYYY-MM-DD')   AS pickup_date,
              to_char(delivery_date, 'YYYY-MM-DD') AS delivery_date
         FROM loads
        WHERE load_id = $1 AND user_id = $2;`,
      [load_id, user_id],
    );
    if (current.rowCount === 0) throw new NotFoundError("Load not found");
    existingDates = current.rows[0];
  }

  // Must pass validation checks before query request
  const errors = validateLoadPatch(data, existingDates);

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
