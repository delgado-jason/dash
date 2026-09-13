import { db } from "../../db/pool.js";
import {
  validateComplianceCreate,
  validateCompliancePatch,
} from "../utils/validation/complianceValidation.js";
import {
  validateComplianceRenewal,
  addMonths,
  CDL_NUMBER_MAX,
} from "../utils/validation/complianceRenewalValidation.js";
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

// The newest closed cycle for one subject, as jsonb, plus how many cycles there
// are in all. `subjectCol` is 'compliance_item_id' or 'driver_id' — the two
// halves of the table's CHECK — and `alias` is the outer row the LATERAL reads.
// Both are code-controlled identifiers, never request input.
//
// Carried on the LIST endpoints so the row's history line costs nothing: the
// page's existing fetch already answers "renewed when · was due when", and only
// the "n earlier" fold pays for the full list.
export const lastRenewalJoin = (subjectCol, alias) => `
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
             'renewal_id',      cr.renewal_id,
             'renewed_on',      to_char(cr.renewed_on, 'YYYY-MM-DD'),
             'expired_on',      to_char(cr.expired_on, 'YYYY-MM-DD'),
             'next_expires_on', to_char(cr.next_expires_on, 'YYYY-MM-DD')
           ) AS last_renewal
      FROM compliance_renewals cr
     WHERE cr.user_id = ${alias}.user_id
       AND cr.${subjectCol} = ${alias}.${subjectCol}
     ORDER BY cr.renewed_on DESC, cr.created_at DESC
     LIMIT 1
  ) lr ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS renewal_count
      FROM compliance_renewals cr
     WHERE cr.user_id = ${alias}.user_id
       AND cr.${subjectCol} = ${alias}.${subjectCol}
  ) rc ON true`;

export async function getComplianceItems(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${COLUMNS}, lr.last_renewal, COALESCE(rc.renewal_count, 0) AS renewal_count
       FROM compliance_items ci
       ${lastRenewalJoin("compliance_item_id", "ci")}
      WHERE ci.user_id = $1
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

// ---------------------------------------------------------------- RENEWALS --
// "Mark renewed" is two writes that must land together: the cycle that just
// closed is written down, THEN the item's dates roll forward. One transaction,
// and the row is read FOR UPDATE so two taps can't both read the old cycle and
// write it twice.

// What the renewal row carries out of the closing cycle, plus the columns the
// roll needs. Dates come out as text (to_char) — a DATE through pg's Date
// parser is a local-midnight timestamp, and a day key has no zone.
const CLOSING_CYCLE = `
  to_char(issued_on, 'YYYY-MM-DD')  AS issued_on,
  to_char(expires_on, 'YYYY-MM-DD') AS expired_on,
  doc_number, renewal_months`;

// The expiry the renewal lands on: what the sheet sent, else what the cadence
// says. An item with neither can't be renewed — the date is the whole point.
//
// Exported for its own test: it is the one place a date the owner never typed
// gets written to the item, so it is the one place that has to be sure of it.
export const resolveNextExpiry = (body, renewed_on, renewal_months) => {
  const given = body.next_expires_on;
  if (given != null && given !== "") return given;
  // addMonths answers null on anything it can't compute honestly (a cadence
  // that isn't a whole number of months, say) — a null expiry would quietly
  // blank the item's clock, so it is an error, not a value.
  const computed = renewal_months ? addMonths(renewed_on, renewal_months) : null;
  // A computed date gets the SAME rule the sheet's own date gets: after the
  // renewal day. A seeded cadence of -12 months computes a real date in the
  // past, which would file a brand-new cycle as already expired — so the
  // cadence is refused with the sentence the owner can act on (fix the date,
  // or fix the cadence) rather than silently backdating the clock. Day keys
  // are fixed-width, so the string compare IS a date compare.
  if (computed && computed > renewed_on) return computed;
  throw new ValidationError("A renewal needs the next expiry date.");
};

// `doc_number` is "if given": absent leaves the number alone, a value (an empty
// string included) replaces it. Blank means "no number", not the string "".
const nextDocNumber = (body, current) => {
  if (body.doc_number === undefined) return current;
  const v = typeof body.doc_number === "string" ? body.doc_number.trim() : null;
  return v || null;
};

const trimmedNote = (note) =>
  typeof note === "string" && note.trim() ? note.trim() : null;

export async function renewComplianceItem(user_id, compliance_item_id, body, actor = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!compliance_item_id) throw new ValidationError("Missing compliance_item_id");

  const errors = validateComplianceRenewal(body);
  if (errors.length > 0) throw new ValidationError(errors.join(" "), errors);

  const renewed_on = body.renewed_on;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const cur = await client.query(
      `SELECT ${CLOSING_CYCLE} FROM compliance_items
        WHERE user_id = $1 AND compliance_item_id = $2
        FOR UPDATE`,
      [user_id, compliance_item_id],
    );
    if (cur.rowCount === 0) throw new NotFoundError("Compliance item not found");
    const closing = cur.rows[0];

    const next_expires_on = resolveNextExpiry(body, renewed_on, closing.renewal_months);

    await client.query(
      `INSERT INTO compliance_renewals
         (user_id, compliance_item_id, issued_on, expired_on, doc_number,
          renewed_on, next_expires_on, note, renewed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        user_id,
        compliance_item_id,
        closing.issued_on,
        closing.expired_on,
        closing.doc_number,
        renewed_on,
        next_expires_on,
        trimmedNote(body.note),
        actor.self_id ?? null,
      ],
    );

    const updated = await client.query(
      `UPDATE compliance_items
          SET issued_on = $3, expires_on = $4, doc_number = $5, updated_at = NOW()
        WHERE user_id = $1 AND compliance_item_id = $2
        RETURNING ${COLUMNS}`,
      [
        user_id,
        compliance_item_id,
        renewed_on,
        next_expires_on,
        nextDocNumber(body, closing.doc_number),
      ],
    );

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// The CDL has no compliance_items row — it lives on the driver record — so its
// renewal row hangs off driver_id instead, the other half of the table's CHECK.
// The closing cycle has no issued date to keep: drivers carry only the expiry.
export async function renewDriverCdl(user_id, driver_id, body, actor = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!driver_id) throw new ValidationError("Missing driver_id");

  // The number this path writes is drivers.cdl_number — VARCHAR(50), narrower
  // than a compliance item's, so the cap travels with the column.
  const errors = validateComplianceRenewal(body, new Date(), {
    docMax: CDL_NUMBER_MAX,
  });
  if (errors.length > 0) throw new ValidationError(errors.join(" "), errors);

  const renewed_on = body.renewed_on;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const cur = await client.query(
      `SELECT to_char(cdl_expiration, 'YYYY-MM-DD') AS expired_on, cdl_number
         FROM drivers
        WHERE user_id = $1 AND driver_id = $2
        FOR UPDATE`,
      [user_id, driver_id],
    );
    if (cur.rowCount === 0) throw new NotFoundError("Driver not found");
    const closing = cur.rows[0];

    // A driver record carries no renewal cadence column, so there is nothing to
    // compute from: the sheet sends the date, or this is a 400.
    const next_expires_on = resolveNextExpiry(body, renewed_on, null);

    await client.query(
      `INSERT INTO compliance_renewals
         (user_id, driver_id, issued_on, expired_on, doc_number,
          renewed_on, next_expires_on, note, renewed_by)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)`,
      [
        user_id,
        driver_id,
        closing.expired_on,
        closing.cdl_number,
        renewed_on,
        next_expires_on,
        trimmedNote(body.note),
        actor.self_id ?? null,
      ],
    );

    const updated = await client.query(
      `UPDATE drivers
          SET cdl_expiration = $3, cdl_number = $4, updated_at = NOW()
        WHERE user_id = $1 AND driver_id = $2
        RETURNING driver_id, first_name, last_name, phone, email, cdl_number,
                  cdl_state, cdl_expiration, endorsements, hire_date, avatar_url,
                  notes, active, created_at, updated_at`,
      [user_id, driver_id, next_expires_on, nextDocNumber(body, closing.cdl_number)],
    );

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---- the history, newest first ----
// `renewed_by` is nullable (the renewer's login can be deleted), so the join to
// users is a LEFT JOIN — an INNER one would drop those rows from the trail.
const HISTORY = `
  SELECT cr.renewal_id,
         to_char(cr.issued_on, 'YYYY-MM-DD')       AS issued_on,
         to_char(cr.expired_on, 'YYYY-MM-DD')      AS expired_on,
         cr.doc_number,
         to_char(cr.renewed_on, 'YYYY-MM-DD')      AS renewed_on,
         to_char(cr.next_expires_on, 'YYYY-MM-DD') AS next_expires_on,
         cr.note,
         cr.renewed_by,
         u.display_name AS renewed_by_name,
         cr.created_at
    FROM compliance_renewals cr
    LEFT JOIN users u ON u.user_id = cr.renewed_by`;

export async function getComplianceRenewals(user_id, compliance_item_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!compliance_item_id) throw new ValidationError("Missing compliance_item_id");

  // The history is only readable through an item the account owns.
  const owns = await db.query(
    `SELECT 1 FROM compliance_items WHERE user_id = $1 AND compliance_item_id = $2`,
    [user_id, compliance_item_id],
  );
  if (owns.rowCount === 0) throw new NotFoundError("Compliance item not found");

  const result = await db.query(
    `${HISTORY}
      WHERE cr.user_id = $1 AND cr.compliance_item_id = $2
      ORDER BY cr.renewed_on DESC, cr.created_at DESC`,
    [user_id, compliance_item_id],
  );
  return result.rows;
}

export async function getDriverCdlRenewals(user_id, driver_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!driver_id) throw new ValidationError("Missing driver_id");

  const owns = await db.query(
    `SELECT 1 FROM drivers WHERE user_id = $1 AND driver_id = $2`,
    [user_id, driver_id],
  );
  if (owns.rowCount === 0) throw new NotFoundError("Driver not found");

  const result = await db.query(
    `${HISTORY}
      WHERE cr.user_id = $1 AND cr.driver_id = $2
      ORDER BY cr.renewed_on DESC, cr.created_at DESC`,
    [user_id, driver_id],
  );
  return result.rows;
}
