import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const UNITS = ["tractor", "trailer"];
const isUnit = (u) => UNITS.includes(u);

// ---- SCHEDULE ITEMS ----

export async function getMaintenanceItems(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT item_id, unit, name, category, interval_miles, interval_months,
            interval_hours, last_done_miles, last_done_date, active, notes,
            warn_lead_days, truck_id, trailer_id
     FROM maintenance_items
     WHERE user_id = $1
     ORDER BY category, name`,
    [user_id],
  );
  return result.rows;
}

const ITEM_FIELDS = [
  "unit",
  "name",
  "category",
  "interval_miles",
  "interval_months",
  "interval_hours",
  "last_done_miles",
  "last_done_date",
  "active",
  "notes",
  "warn_lead_days",
];

export async function createMaintenanceItem(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!data.name) throw new ValidationError("name is required");
  if (!isUnit(data.unit)) throw new ValidationError("unit must be tractor or trailer");

  const result = await db.query(
    `INSERT INTO maintenance_items
       (user_id, unit, name, category, interval_miles, interval_months,
        interval_hours, last_done_miles, last_done_date, notes, warn_lead_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING item_id, unit, name, category, interval_miles, interval_months,
               interval_hours, last_done_miles, last_done_date, active, notes, warn_lead_days`,
    [
      user_id,
      data.unit,
      data.name,
      data.category ?? "other",
      data.interval_miles ?? null,
      data.interval_months ?? null,
      data.interval_hours ?? null,
      data.last_done_miles ?? null,
      data.last_done_date ?? null,
      data.notes ?? null,
      data.warn_lead_days ?? 14,
    ],
  );
  return result.rows[0];
}

export async function patchMaintenanceItem(user_id, item_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!item_id) throw new ValidationError("Missing item_id");
  if (data.unit !== undefined && !isUnit(data.unit))
    throw new ValidationError("unit must be tractor or trailer");

  const updates = [];
  const values = [];
  let i = 1;
  for (const field of ITEM_FIELDS) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(data[field]);
      i++;
    }
  }
  if (updates.length === 0) throw new ValidationError("No valid fields to update");

  updates.push(`updated_at = NOW()`);
  values.push(item_id, user_id);

  const result = await db.query(
    `UPDATE maintenance_items SET ${updates.join(", ")}
     WHERE item_id = $${i} AND user_id = $${i + 1}
     RETURNING item_id, unit, name, category, interval_miles, interval_months,
               interval_hours, last_done_miles, last_done_date, active, notes, warn_lead_days`,
    values,
  );
  if (result.rowCount === 0) throw new NotFoundError("Maintenance item not found");
  return result.rows[0];
}

export async function deleteMaintenanceItem(user_id, item_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!item_id) throw new ValidationError("Missing item_id");
  const result = await db.query(
    `DELETE FROM maintenance_items WHERE item_id = $1 AND user_id = $2
     RETURNING item_id`,
    [item_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Maintenance item not found");
  return result.rows[0];
}

// ---- SERVICES LOG ----

export async function getMaintenanceServices(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT s.service_id, s.unit, s.service_date, s.odometer, s.vendor,
            s.location, s.description, s.cost, s.invoice_number, s.receipt_ref,
            s.notes,
            COALESCE(
              array_agg(si.item_id) FILTER (WHERE si.item_id IS NOT NULL), '{}'
            ) AS item_ids
     FROM maintenance_services s
     LEFT JOIN maintenance_service_items si ON si.service_id = s.service_id
     WHERE s.user_id = $1
     GROUP BY s.service_id
     ORDER BY s.service_date DESC, s.created_at DESC`,
    [user_id],
  );
  return result.rows;
}

// Create a service and, if it's linked to schedule items, reset those items'
// "last done" to this service (unless they already have a newer completion).
export async function createMaintenanceService(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!data.service_date) throw new ValidationError("service_date is required");
  if (!data.description) throw new ValidationError("description is required");
  if (!isUnit(data.unit)) throw new ValidationError("unit must be tractor or trailer");

  const itemIds = Array.isArray(data.item_ids) ? data.item_ids : [];

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const svc = await client.query(
      `INSERT INTO maintenance_services
         (user_id, unit, service_date, odometer, vendor, location, description,
          cost, invoice_number, receipt_ref, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING service_id, unit, service_date, odometer, vendor, location,
                 description, cost, invoice_number, receipt_ref, notes`,
      [
        user_id,
        data.unit,
        data.service_date,
        data.odometer ?? null,
        data.vendor ?? null,
        data.location ?? null,
        data.description,
        data.cost ?? null,
        data.invoice_number ?? null,
        data.receipt_ref ?? null,
        data.notes ?? null,
      ],
    );
    const service_id = svc.rows[0].service_id;

    for (const item_id of itemIds) {
      // Only reset items that belong to this user; skip unknown ids.
      const link = await client.query(
        `INSERT INTO maintenance_service_items (service_id, item_id)
         SELECT $1, item_id FROM maintenance_items
         WHERE item_id = $2 AND user_id = $3
         RETURNING item_id`,
        [service_id, item_id, user_id],
      );
      if (link.rowCount === 0) continue;
      // Don't let a back-dated entry clobber a newer completion.
      await client.query(
        `UPDATE maintenance_items
           SET last_done_miles = $1, last_done_date = $2, updated_at = NOW()
         WHERE item_id = $3 AND user_id = $4
           AND (last_done_date IS NULL OR last_done_date <= $2)`,
        [data.odometer ?? null, data.service_date, item_id, user_id],
      );
    }

    await client.query("COMMIT");
    return { ...svc.rows[0], item_ids: itemIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const SERVICE_FIELDS = [
  "unit",
  "service_date",
  "odometer",
  "vendor",
  "location",
  "description",
  "cost",
  "invoice_number",
  "receipt_ref",
  "notes",
];

// Edits scalar fields only. Re-linking items / re-resetting is not handled here
// (delete + re-add if the item links change).
export async function patchMaintenanceService(user_id, service_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!service_id) throw new ValidationError("Missing service_id");
  if (data.unit !== undefined && !isUnit(data.unit))
    throw new ValidationError("unit must be tractor or trailer");

  const updates = [];
  const values = [];
  let i = 1;
  for (const field of SERVICE_FIELDS) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(data[field]);
      i++;
    }
  }
  if (updates.length === 0) throw new ValidationError("No valid fields to update");

  updates.push(`updated_at = NOW()`);
  values.push(service_id, user_id);

  const result = await db.query(
    `UPDATE maintenance_services SET ${updates.join(", ")}
     WHERE service_id = $${i} AND user_id = $${i + 1}
     RETURNING service_id, unit, service_date, odometer, vendor, location,
               description, cost, invoice_number, receipt_ref, notes`,
    values,
  );
  if (result.rowCount === 0) throw new NotFoundError("Service not found");
  return result.rows[0];
}

export async function deleteMaintenanceService(user_id, service_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!service_id) throw new ValidationError("Missing service_id");
  const result = await db.query(
    `DELETE FROM maintenance_services WHERE service_id = $1 AND user_id = $2
     RETURNING service_id`,
    [service_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Service not found");
  return result.rows[0];
}

// ---- STARTER SCHEDULE ---- (severe-duty LT625 + X15 + Eaton Fuller; user edits)
// Inserted only when the user has no items yet. Compliance/DOT lives on its own
// page, so it's intentionally NOT seeded here. Sections come from category:
// transmission → Transmission, trailer unit → Trailer, else → Truck.
// [unit, name, category, interval_miles, interval_months, interval_hours, warn_lead_days]
const STARTER_ITEMS = [
  // Engine — Cummins X15
  ["tractor", "Engine oil + filter", "engine", 25000, 6, null, 14],
  ["tractor", "Fuel filter + water separator", "engine", 25000, null, null, 14],
  ["tractor", "Coolant filter / SCA check", "engine", 50000, 12, null, 21],
  ["tractor", "Crankcase breather filter", "engine", 150000, null, null, 21],
  ["tractor", "DEF / aftertreatment filter", "engine", 300000, null, null, 30],
  ["tractor", "DPF ash cleaning", "engine", 300000, null, null, 30],
  ["tractor", "Valve lash / overhead adjustment", "engine", 500000, 60, null, 30],
  // Chassis — International LT625
  ["tractor", "Chassis lube (grease all points)", "chassis", 25000, null, null, 14],
  ["tractor", "Drive axle / differential fluid", "chassis", 250000, 36, null, 30],
  ["tractor", "Air dryer desiccant cartridge", "chassis", 150000, 36, null, 30],
  ["tractor", "Wheel seals / hub oil (inspect)", "chassis", 25000, null, null, 14],
  ["tractor", "Alignment", "chassis", null, 12, null, 21],
  ["tractor", "Cabin / HVAC filter", "chassis", null, 12, null, 14],
  ["tractor", "Brake inspection (linings, chambers, slack)", "brakes", 25000, null, null, 14],
  // Transmission — Eaton Fuller (synthetic PS-386)
  ["tractor", "Transmission fluid change (Eaton Fuller · synthetic)", "transmission", 500000, null, null, 30],
  ["tractor", "Transmission level + magnetic plug check", "transmission", 25000, null, null, 14],
  // Trailer
  ["trailer", "Trailer lube / grease", "trailer", 25000, null, null, 14],
  ["trailer", "Trailer brakes / ABS / lights / tape", "trailer", 25000, null, null, 14],
];

export async function seedMaintenanceItems(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const existing = await db.query(
    `SELECT 1 FROM maintenance_items WHERE user_id = $1 LIMIT 1`,
    [user_id],
  );
  if (existing.rowCount > 0)
    throw new ValidationError("You already have maintenance items");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    for (const [unit, name, category, miles, months, hours, warn] of STARTER_ITEMS) {
      await client.query(
        `INSERT INTO maintenance_items
           (user_id, unit, name, category, interval_miles, interval_months, interval_hours, warn_lead_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user_id, unit, name, category, miles, months, hours, warn],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getMaintenanceItems(user_id);
}
