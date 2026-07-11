import { db } from "../../db/pool.js";
import {
  validateComplianceCreate,
  validateCompliancePatch,
} from "../utils/validation/complianceValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const COLUMNS = `
  compliance_item_id, user_id, scope, driver_id, truck_id, trailer_id,
  label, category, issued_on, expires_on, renewal_months, warn_lead_days,
  doc_number, notes, active, created_at, updated_at
`;

const WRITABLE = [
  "scope",
  "driver_id",
  "truck_id",
  "trailer_id",
  "label",
  "category",
  "issued_on",
  "expires_on",
  "renewal_months",
  "warn_lead_days",
  "doc_number",
  "notes",
  "active",
];

// The entity column each non-business scope must point at, and its table.
const SCOPE_ENTITY = {
  driver: { col: "driver_id", table: "drivers", id: "driver_id" },
  truck: { col: "truck_id", table: "trucks", id: "truck_id" },
  trailer: { col: "trailer_id", table: "trailers", id: "trailer_id" },
};

// Confirm a linked entity belongs to the user; throw if not.
async function assertOwns(user_id, table, idCol, idValue) {
  const r = await db.query(
    `SELECT 1 FROM ${table} WHERE user_id = $1 AND ${idCol} = $2`,
    [user_id, idValue],
  );
  if (r.rowCount === 0) throw new NotFoundError(`${table.slice(0, -1)} not found`);
}

// Given a scope, resolve which entity id must be present + owned. Business
// scope clears all three entity links.
async function reconcileScope(user_id, scope, data) {
  if (scope === "business") {
    data.driver_id = null;
    data.truck_id = null;
    data.trailer_id = null;
    return;
  }
  const entity = SCOPE_ENTITY[scope];
  const idValue = data[entity.col];
  if (!idValue) throw new ValidationError(`${scope} scope requires ${entity.col}`);
  await assertOwns(user_id, entity.table, entity.id, idValue);
  // Null the other two links so a row never points at more than its scope.
  for (const s of Object.values(SCOPE_ENTITY))
    if (s.col !== entity.col) data[s.col] = null;
}

export async function getComplianceItems(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${COLUMNS} FROM compliance_items
     WHERE user_id = $1
     ORDER BY expires_on ASC NULLS LAST, label ASC`,
    [user_id],
  );
  return result.rows;
}

export async function createComplianceItem(user_id, body) {
  if (!user_id) throw new ValidationError("Missing user_id");

  for (const field in body)
    if (!WRITABLE.includes(field))
      throw new ValidationError(`${field} not allowed`);

  const errors = validateComplianceCreate(body);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const data = { ...body };
  await reconcileScope(user_id, data.scope, data);

  const fields = ["user_id"];
  const values = [user_id];
  const placeholders = ["$1"];
  let index = 2;

  for (const field of WRITABLE) {
    if (data[field] !== undefined) {
      fields.push(field);
      values.push(data[field]);
      placeholders.push(`$${index}`);
      index++;
    }
  }

  const result = await db.query(
    `INSERT INTO compliance_items (${fields.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${COLUMNS}`,
    values,
  );
  return result.rows[0];
}

export async function patchComplianceItem(user_id, compliance_item_id, body) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!compliance_item_id) throw new ValidationError("Missing compliance_item_id");

  for (const field in body)
    if (!WRITABLE.includes(field))
      throw new ValidationError(`${field} not allowed`);

  const errors = validateCompliancePatch(body);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const data = { ...body };
  // If the scope itself is changing, re-validate its entity link. If only an
  // entity link is changing without a scope, confirm ownership of it.
  if (data.scope !== undefined) {
    await reconcileScope(user_id, data.scope, data);
  } else {
    for (const s of Object.values(SCOPE_ENTITY))
      if (data[s.col]) await assertOwns(user_id, s.table, s.id, data[s.col]);
  }

  const updates = [];
  const values = [];
  let index = 1;
  for (const field of WRITABLE) {
    if (data[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(data[field]);
      index++;
    }
  }
  if (updates.length === 0)
    throw new ValidationError("No valid fields provided for update");

  updates.push("updated_at = NOW()");
  values.push(user_id, compliance_item_id);

  const result = await db.query(
    `UPDATE compliance_items SET ${updates.join(", ")}
     WHERE user_id = $${index} AND compliance_item_id = $${index + 1}
     RETURNING ${COLUMNS}`,
    values,
  );
  if (result.rowCount === 0) throw new NotFoundError("Compliance item not found");
  return result.rows[0];
}

export async function deleteComplianceItem(user_id, compliance_item_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!compliance_item_id) throw new ValidationError("Missing compliance_item_id");

  const result = await db.query(
    `DELETE FROM compliance_items
     WHERE user_id = $1 AND compliance_item_id = $2
     RETURNING ${COLUMNS}`,
    [user_id, compliance_item_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Compliance item not found");
  return result.rows[0];
}
