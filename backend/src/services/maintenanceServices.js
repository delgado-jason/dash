import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import { canonicalVendorName } from "../utils/vendorNames.js";
import { listVendorNames } from "./vendorServices.js";
import {
  isUnit,
  isServiceUnit,
  apuHoursErrors,
  READING_FIELD,
  UNIT_ERROR,
  SERVICE_UNIT_ERROR,
} from "../utils/validation/maintenanceValidation.js";

// Resolve the user's single active truck/trailer so maintenance auto-links to
// the right entity when there's only one — no picker needed. Returns null when
// there are 0 or (to stay unambiguous) more than 1; the multi case is handled
// by an explicit selector. `runner` is db or a transaction client.
async function singleEntity(runner, table, idCol, user_id) {
  const r = await runner.query(
    `SELECT ${idCol} FROM ${table} WHERE user_id = $1 AND is_deleted = false`,
    [user_id],
  );
  return r.rowCount === 1 ? r.rows[0][idCol] : null;
}
async function resolveFleet(runner, user_id) {
  return {
    truckId: await singleEntity(runner, "trucks", "truck_id", user_id),
    trailerId: await singleEntity(runner, "trailers", "trailer_id", user_id),
  };
}
// The APU hangs on the truck, so an 'apu' row links to the same truck a
// 'tractor' row would — it just reads a different meter.
// The log's vendor column is free text, so one shop drifts into two spellings
// and every board that groups by it splits the total. A name that matches a
// vendor — its own name, or a spelling a merge filed as an alias (12A) — is
// written down as the vendor spells it; anything else is kept as typed. Read on
// the transaction's own client so the write sees the rolodex the merge left.
async function canonicalizeVendor(client, user_id, data) {
  if (typeof data.vendor !== "string" || data.vendor.trim() === "") return;
  data.vendor = canonicalVendorName(
    data.vendor,
    await listVendorNames(client, user_id),
  );
}

const linkFor = (unit, ids, data) => ({
  truck_id:
    unit === "tractor" || unit === "both" || unit === "apu"
      ? (data.truck_id ?? ids.truckId)
      : null,
  trailer_id:
    unit === "trailer" || unit === "both"
      ? (data.trailer_id ?? ids.trailerId)
      : null,
});

// ---- SCHEDULE ITEMS ----

export async function getMaintenanceItems(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT item_id, unit, name, category, interval_miles, interval_months,
            interval_hours, last_done_miles, last_done_hours, last_done_date,
            active, notes, warn_lead_days, truck_id, trailer_id
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
  // The APU's baseline: the hour meter when this item was last done. Editable
  // by hand, and stamped by a service that carries a reading.
  "last_done_hours",
  "last_done_date",
  "active",
  "notes",
  "warn_lead_days",
];

export async function createMaintenanceItem(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!data.name) throw new ValidationError("name is required");
  if (!isUnit(data.unit)) throw new ValidationError(UNIT_ERROR);
  const hoursErrors = apuHoursErrors(data.last_done_hours, "last_done_hours");
  if (hoursErrors.length) throw new ValidationError(hoursErrors[0]);

  const link = linkFor(data.unit, await resolveFleet(db, user_id), data);

  const result = await db.query(
    `INSERT INTO maintenance_items
       (user_id, unit, name, category, interval_miles, interval_months,
        interval_hours, last_done_miles, last_done_hours, last_done_date, notes,
        warn_lead_days, truck_id, trailer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING item_id, unit, name, category, interval_miles, interval_months,
               interval_hours, last_done_miles, last_done_hours, last_done_date,
               active, notes, warn_lead_days, truck_id, trailer_id`,
    [
      user_id,
      data.unit,
      data.name,
      data.category ?? "other",
      data.interval_miles ?? null,
      data.interval_months ?? null,
      data.interval_hours ?? null,
      data.last_done_miles ?? null,
      data.last_done_hours ?? null,
      data.last_done_date ?? null,
      data.notes ?? null,
      data.warn_lead_days ?? 14,
      link.truck_id,
      link.trailer_id,
    ],
  );
  return result.rows[0];
}

export async function patchMaintenanceItem(user_id, item_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!item_id) throw new ValidationError("Missing item_id");
  if (data.unit !== undefined && !isUnit(data.unit))
    throw new ValidationError(UNIT_ERROR);
  const hoursErrors = apuHoursErrors(data.last_done_hours, "last_done_hours");
  if (hoursErrors.length) throw new ValidationError(hoursErrors[0]);

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
               interval_hours, last_done_miles, last_done_hours, last_done_date,
               active, notes, warn_lead_days`,
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
    `SELECT s.service_id, s.unit, s.service_date, s.odometer, s.trailer_hub,
            s.apu_hours, s.vendor, s.location, s.description, s.cost,
            s.invoice_number, s.receipt_ref, s.notes,
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
  if (!isServiceUnit(data.unit)) throw new ValidationError(SERVICE_UNIT_ERROR);
  const hoursErrors = apuHoursErrors(data.apu_hours);
  if (hoursErrors.length) throw new ValidationError(hoursErrors[0]);

  const itemIds = Array.isArray(data.item_ids) ? data.item_ids : [];
  // Three meters, one per unit: `odometer` is the truck reading, `trailer_hub`
  // the trailer's hub, `apu_hours` the APU's hour meter. A combined ("both")
  // service carries the first two; each completed item is reset with the
  // reading for its OWN unit, and a missing reading stays null.
  const readings = {
    odometer: data.odometer ?? null,
    trailer_hub: data.trailer_hub ?? null,
    apu_hours: data.apu_hours ?? null,
  };

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    await canonicalizeVendor(client, user_id, data);

    const link = linkFor(data.unit, await resolveFleet(client, user_id), data);

    const svc = await client.query(
      `INSERT INTO maintenance_services
         (user_id, unit, service_date, odometer, trailer_hub, apu_hours, vendor,
          location, description, cost, invoice_number, receipt_ref, notes,
          truck_id, trailer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING service_id, unit, service_date, odometer, trailer_hub,
                 apu_hours, vendor, location, description, cost, invoice_number,
                 receipt_ref, notes`,
      [
        user_id,
        data.unit,
        data.service_date,
        readings.odometer,
        readings.trailer_hub,
        readings.apu_hours,
        data.vendor ?? null,
        data.location ?? null,
        data.description,
        data.cost ?? null,
        data.invoice_number ?? null,
        data.receipt_ref ?? null,
        data.notes ?? null,
        link.truck_id,
        link.trailer_id,
      ],
    );
    const service_id = svc.rows[0].service_id;

    for (const item_id of itemIds) {
      // Only reset items that belong to this user; skip unknown ids. The item's
      // unit decides which reading resets it (trailer items use the hub). The
      // join table has no `unit`, so read it from maintenance_items directly.
      const owned = await client.query(
        `SELECT unit FROM maintenance_items WHERE item_id = $1 AND user_id = $2`,
        [item_id, user_id],
      );
      if (owned.rowCount === 0) continue;

      await client.query(
        `INSERT INTO maintenance_service_items (service_id, item_id)
         VALUES ($1, $2)`,
        [service_id, item_id],
      );

      // The item's own meter: hours for an APU item, the hub for a trailer
      // item, the odometer for everything else. An APU item's baseline lives
      // in `last_done_hours`, so it resets a different column.
      const unit = owned.rows[0].unit;
      const reading = readings[READING_FIELD[unit] ?? "odometer"] ?? null;
      const column = unit === "apu" ? "last_done_hours" : "last_done_miles";
      // THE COMPLETION RULE — blank reading → NULL baseline, deliberately.
      // The item's baseline must describe THIS completion, so a service logged
      // without a meter stamps the date and clears the reading: the clock now
      // says "needs a meter before it can count" instead of measuring the new
      // interval from a meter that was read at the PREVIOUS service. A truck PM
      // logged without an odometer behaves exactly as it did before the APU
      // work. (Keeping the old number with a COALESCE would be worse than a
      // blank: it reads as a real baseline and silently runs the interval long.)
      // The date guard is separate — it stops a back-dated entry from
      // clobbering a newer completion.
      await client.query(
        `UPDATE maintenance_items
           SET ${column} = $1, last_done_date = $2, updated_at = NOW()
         WHERE item_id = $3 AND user_id = $4
           AND (last_done_date IS NULL OR last_done_date <= $2)`,
        [reading, data.service_date, item_id, user_id],
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
  "trailer_hub",
  "apu_hours",
  "vendor",
  "location",
  "description",
  "cost",
  "invoice_number",
  "receipt_ref",
  "notes",
];

// Which fields on a patch carry a METER — derived from READING_FIELD so the
// two can never drift apart. Any of them arriving means the visit's readings
// changed, so the clocks this visit reset have to be re-stamped.
const READING_FIELDS = Object.values(READING_FIELD);

// Edits scalar fields only. Re-linking items is not handled here (delete +
// re-add if the item links change) — but a reading typed in AFTER the fact IS,
// see below.
export async function patchMaintenanceService(user_id, service_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!service_id) throw new ValidationError("Missing service_id");
  if (data.unit !== undefined && !isServiceUnit(data.unit))
    throw new ValidationError(SERVICE_UNIT_ERROR);
  const hoursErrors = apuHoursErrors(data.apu_hours);
  if (hoursErrors.length) throw new ValidationError(hoursErrors[0]);

  const updates = [];
  const values = [];
  let i = 1;
  // Where the vendor's value sits in `values`, so the canonical spelling can be
  // dropped in once the transaction is open (-1 = the patch doesn't touch it).
  let vendorSlot = -1;
  for (const field of SERVICE_FIELDS) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(data[field]);
      if (field === "vendor") vendorSlot = values.length - 1;
      i++;
    }
  }
  if (updates.length === 0) throw new ValidationError("No valid fields to update");

  updates.push(`updated_at = NOW()`);
  values.push(service_id, user_id);

  const carriesReading = READING_FIELDS.some((f) => data[f] !== undefined);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    if (vendorSlot !== -1) {
      await canonicalizeVendor(client, user_id, data);
      values[vendorSlot] = data.vendor;
    }

    const result = await client.query(
      `UPDATE maintenance_services SET ${updates.join(", ")}
       WHERE service_id = $${i} AND user_id = $${i + 1}
       RETURNING service_id, unit, service_date, odometer, trailer_hub, apu_hours,
                 vendor, location, description, cost, invoice_number, receipt_ref,
                 notes`,
      values,
    );
    if (result.rowCount === 0) throw new NotFoundError("Service not found");

    // The meter usually shows up late: the Thermo King invoice surfaces a week
    // after the visit, or he finally reads the hour meter and edits the row.
    // That number has to reach the clocks this visit reset, or the schedule
    // keeps saying "needs a reading" for a number it is already holding.
    //
    // Same rule as create, field for field: each linked item is stamped with
    // the reading for its OWN unit (apu → apu_hours, trailer → trailer_hub,
    // everything else → odometer), a BLANK reading writes NULL rather than
    // leaving a baseline from some earlier visit standing, and the date guard
    // still stops a back-dated row from clobbering a newer completion.
    // Done in SQL off the service row itself so the DATE never round-trips
    // through JavaScript, and inside the transaction so the patch and the
    // stamps land together.
    if (carriesReading) {
      const stamp = (column, expr, unitTest) =>
        client.query(
          `UPDATE maintenance_items mi
              SET ${column} = ${expr},
                  last_done_date = s.service_date,
                  updated_at = NOW()
             FROM maintenance_services s
             JOIN maintenance_service_items si ON si.service_id = s.service_id
            WHERE s.service_id = $1
              AND s.user_id = $2
              AND mi.item_id = si.item_id
              AND mi.user_id = $2
              AND mi.unit ${unitTest}
              AND (mi.last_done_date IS NULL OR mi.last_done_date <= s.service_date)`,
          [service_id, user_id],
        );
      await stamp("last_done_hours", "s.apu_hours", "= 'apu'");
      await stamp(
        "last_done_miles",
        "CASE WHEN mi.unit = 'trailer' THEN s.trailer_hub ELSE s.odometer END",
        "<> 'apu'",
      );
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
// transmission → Transmission, trailer unit → Trailer, apu unit → APU,
// else → Truck.
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
  // APU — Thermo King TriPac Evolution. Hours, not miles: the APU runs while
  // the truck sits, so its odometer says nothing about its wear.
  ["apu", "APU oil & filter", "apu", null, 12, 1000, 30],
  ["apu", "APU belt & alternator", "apu", null, null, 500, 14],
  ["apu", "APU air filter", "apu", null, null, 1000, 14],
  ["apu", "APU coolant", "apu", null, 24, null, 14],
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
    const ids = await resolveFleet(client, user_id);
    for (const [unit, name, category, miles, months, hours, warn] of STARTER_ITEMS) {
      const l = linkFor(unit, ids, {});
      await client.query(
        `INSERT INTO maintenance_items
           (user_id, unit, name, category, interval_miles, interval_months, interval_hours, warn_lead_days, truck_id, trailer_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [user_id, unit, name, category, miles, months, hours, warn, l.truck_id, l.trailer_id],
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
