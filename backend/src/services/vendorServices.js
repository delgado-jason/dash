import { db } from "../../db/pool.js";
import {
  validateVendorCreate,
  validateVendorPatch,
  validateVendorName,
  nameKey,
  asciiTrim,
} from "../utils/validation/vendorValidation.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../utils/error.js";

// The writable columns (user_id is always set from the token, never the body).
const VENDOR_FIELDS = [
  "name",
  "category",
  "rating",
  "contact_name",
  "phone",
  "email",
  "website",
  "city",
  "state",
  "service_area",
  "status",
  "notes",
];

// Maintenance-side vendors get a spend readout derived from the maintenance
// log, matched by name (the maintenance vendor field is free text — no FK
// yet). Gated to the categories maintenance money actually flows to, so a
// coincidental name match can't attribute shop spend to an escort or a permit
// service. SUM(cost) is numeric → serialized as a string; service_count is a
// real integer.
export const MAINTENANCE_CATEGORIES = ["Shop", "Tires", "Parts", "Towing", "Washout"];
const MAINTENANCE_CATEGORY_LIST = MAINTENANCE_CATEGORIES.map((c) => `'${c}'`).join(", ");

// One vendor, every spelling of it: the name or any alias a merge filed
// (decision 12A). Merged rows are rewritten to the name, so the alias arm only
// catches rows written before the merge or by something outside dash — but it
// has to be here, or a wrong merge undone from the vendor card would drop the
// history it was supposed to keep.
const NAME_OR_ALIAS = `(
      LOWER(TRIM(m.vendor)) = LOWER(TRIM(v.name))
      OR LOWER(TRIM(m.vendor)) IN (SELECT LOWER(TRIM(a)) FROM unnest(v.aliases) a)
    )`;

const SPEND_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      SUM(m.cost)            AS total_spend,
      COUNT(*)::int          AS service_count,
      MAX(m.service_date)    AS last_service
    FROM maintenance_services m
    WHERE m.user_id = v.user_id
      AND v.category IN (${MAINTENANCE_CATEGORY_LIST})
      AND ${NAME_OR_ALIAS}
  ) spend ON TRUE
`;

const VENDOR_COLUMNS = `
  v.vendor_id,
  v.name,
  v.aliases,
  v.category,
  v.rating,
  v.contact_name,
  v.phone,
  v.email,
  v.website,
  v.city,
  v.state,
  v.service_area,
  v.status,
  v.notes,
  v.created_at,
  v.updated_at,
  spend.total_spend,
  spend.service_count,
  spend.last_service
`;

// ---- GET VENDORS SERVICE ----
export async function getVendors(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
    SELECT ${VENDOR_COLUMNS}
    FROM vendors v
    ${SPEND_JOIN}
    WHERE v.user_id = $1
    ORDER BY v.name;
  `;

  const result = await db.query(query, [user_id]);
  return result.rows;
}

// The one vendor row every write hands back — the same columns, with the same
// spend readout, that getVendor returns. `runner` is db or a transaction client.
const VENDOR_ROW_QUERY = `
  SELECT ${VENDOR_COLUMNS}
  FROM vendors v
  ${SPEND_JOIN}
  WHERE v.user_id = $1
  AND v.vendor_id = $2;
`;

async function readVendorRow(runner, user_id, vendor_id) {
  const result = await runner.query(VENDOR_ROW_QUERY, [user_id, vendor_id]);
  if (result.rowCount === 0) throw new NotFoundError("Vendor not found");
  return result.rows[0];
}

// ---- GET VENDOR SERVICE ----
export async function getVendor(user_id, vendor_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  const vendorResult = await db.query(VENDOR_ROW_QUERY, [user_id, vendor_id]);
  if (vendorResult.rowCount === 0) throw new NotFoundError("Vendor not found");

  const ratingHistoryResult = await db.query(
    `SELECT * FROM vendor_rating_history WHERE vendor_id = $1 ORDER BY changed_at DESC;`,
    [vendor_id],
  );

  return {
    vendor: vendorResult.rows[0],
    ratingHistory: ratingHistoryResult.rows,
  };
}

// ---- GET UNFILED MAINTENANCE VENDORS ----
// The bridge from the maintenance log into the rolodex: vendor names that
// appear on maintenance services but match no vendor row yet. Grouped
// case/whitespace-insensitively so "TA" and "ta " can't split; the display
// name is one of the raw spellings. Ordered by spend so the biggest missing
// relationship surfaces first.
//
// Two names never reach the board: one that already IS a vendor under some
// spelling (its name or a merged alias — 12A), and one he has waved off as a
// one-off stop (11A). The dismissal is the only thing that hides it; the log
// rows are untouched, which is why the DISMISSED fold can put it right back.
export async function getUnfiledMaintenanceVendors(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
    SELECT
      MAX(TRIM(m.vendor))          AS name,
      COUNT(*)::int                AS service_count,
      SUM(m.cost)                  AS total_spend,
      MAX(m.service_date)          AS last_service,
      array_agg(DISTINCT m.unit)   AS units
    FROM maintenance_services m
    WHERE m.user_id = $1
      AND m.vendor IS NOT NULL
      AND TRIM(m.vendor) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM vendors v
        WHERE v.user_id = m.user_id
          AND ${NAME_OR_ALIAS}
      )
      AND NOT EXISTS (
        SELECT 1 FROM maintenance_vendor_dismissals d
        WHERE d.user_id = m.user_id
          AND d.name_key = LOWER(TRIM(m.vendor))
      )
    GROUP BY LOWER(TRIM(m.vendor))
    ORDER BY SUM(m.cost) DESC NULLS LAST, MAX(TRIM(m.vendor));
  `;

  const result = await db.query(query, [user_id]);
  return result.rows;
}

// ---- GET DISMISSED MAINTENANCE VENDORS ----
// The one-off stops, newest first, each carrying what the log still holds under
// that name — a dismissal hides the name from the bridge, it never touches a
// service row, so the count and the money are read live rather than frozen at
// dismissal time. LEFT JOIN LATERAL: a name whose rows were since deleted or
// renamed still shows, with 0 services.
export async function getDismissedMaintenanceVendors(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
    SELECT
      d.dismissal_id,
      d.name,
      d.created_at          AS dismissed_at,
      svc.service_count,
      svc.total_spend,
      svc.last_service
    FROM maintenance_vendor_dismissals d
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int        AS service_count,
        SUM(m.cost)          AS total_spend,
        MAX(m.service_date)  AS last_service
      FROM maintenance_services m
      WHERE m.user_id = d.user_id
        AND LOWER(TRIM(m.vendor)) = d.name_key
    ) svc ON TRUE
    WHERE d.user_id = $1
    ORDER BY d.created_at DESC;
  `;

  const result = await db.query(query, [user_id]);
  return result.rows;
}

// ---- DISMISS A MAINTENANCE VENDOR (11A · one-off) ----
// Remembered, never deleted. Re-dismissing the same name is idempotent and
// re-stamps who and when (the UNIQUE is on the generated key, so "TA " and
// "ta" are the same one-off).
export async function dismissMaintenanceVendor(user_id, self_id, body = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const errors = validateVendorName(body.name);
  if (errors.length > 0) throw new ValidationError(errors[0]);

  const name = asciiTrim(body.name); // what the log spelled, the way SQL trims it
  const key = nameKey(name);

  // The bridge never offers a name the rolodex already owns, so a dismissal of
  // one is a client that has drifted from the board — refuse it rather than
  // store a row that would silently hide a real vendor's bridge entry later.
  const owner = await db.query(
    `SELECT v.name FROM vendors v
      WHERE v.user_id = $1
        AND (
          LOWER(TRIM(v.name)) = $2
          OR $2 IN (SELECT LOWER(TRIM(a)) FROM unnest(v.aliases) a)
        )
      LIMIT 1;`,
    [user_id, key],
  );
  if (owner.rowCount > 0)
    throw new ConflictError(`“${name}” is a vendor already`);

  const result = await db.query(
    `INSERT INTO maintenance_vendor_dismissals (user_id, name, dismissed_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, name_key) DO UPDATE
       SET name = EXCLUDED.name,
           dismissed_by = EXCLUDED.dismissed_by,
           created_at = now()
     RETURNING *;`,
    [user_id, name, self_id ?? null],
  );

  return result.rows[0];
}

// ---- RESTORE A DISMISSED MAINTENANCE VENDOR (the fold's Undo) ----
export async function restoreMaintenanceVendor(user_id, body = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const errors = validateVendorName(body.name);
  if (errors.length > 0) throw new ValidationError(errors[0]);

  const result = await db.query(
    `DELETE FROM maintenance_vendor_dismissals
      WHERE user_id = $1 AND name_key = $2
      RETURNING *;`,
    [user_id, nameKey(body.name)],
  );
  if (result.rowCount === 0)
    throw new NotFoundError("Nothing dismissed under that name");

  return result.rows[0];
}

// ---- MERGE A LOG SPELLING INTO A VENDOR (12A · alias + rewrite) ----
// One transaction, because the alias and the rewritten rows are one fact: the
// vendor keeps the log's spelling as an alias, and every service written under
// that spelling now reads the vendor's name. Half of that landing alone would
// leave the boards disagreeing, which is the bug this closes.
export async function mergeVendorAlias(user_id, vendor_id, body = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  const errors = validateVendorName(body.name, "alias");
  if (errors.length > 0) throw new ValidationError(errors[0]);

  const alias = asciiTrim(body.name); // the log's spelling, trimmed the way SQL trims
  const key = nameKey(alias);

  let rewritten = 0;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE: the alias array is read, changed and written back, so two
    // merges racing on one vendor must queue instead of clobbering each other.
    const current = await client.query(
      `SELECT vendor_id, name, aliases FROM vendors
        WHERE user_id = $1 AND vendor_id = $2
        FOR UPDATE;`,
      [user_id, vendor_id],
    );
    if (current.rowCount === 0) throw new NotFoundError("Vendor not found");
    const vendor = current.rows[0];

    if (key === nameKey(vendor.name))
      throw new ValidationError("That is already this vendor's name");

    const other = await client.query(
      `SELECT v.name FROM vendors v
        WHERE v.user_id = $1
          AND v.vendor_id <> $2
          AND (
            LOWER(TRIM(v.name)) = $3
            OR $3 IN (SELECT LOWER(TRIM(a)) FROM unnest(v.aliases) a)
          )
        LIMIT 1;`,
      [user_id, vendor_id, key],
    );
    if (other.rowCount > 0)
      throw new ConflictError(
        `“${alias}” already belongs to ${other.rows[0].name}`,
      );

    const existing = Array.isArray(vendor.aliases) ? vendor.aliases : [];
    const alreadyFiled = existing.some((a) => nameKey(a) === key);
    if (!alreadyFiled) {
      await client.query(
        `UPDATE vendors
            SET aliases = array_append(aliases, $1), updated_at = now()
          WHERE vendor_id = $2 AND user_id = $3;`,
        [alias, vendor_id, user_id],
      );
    }

    // The rewrite. Re-running a merge that already filed the alias still sweeps
    // any rows typed under the old spelling since.
    const rewrite = await client.query(
      `UPDATE maintenance_services
          SET vendor = $1, updated_at = now()
        WHERE user_id = $2 AND LOWER(TRIM(vendor)) = $3;`,
      [vendor.name, user_id, key],
    );

    // A merged name cannot also be a one-off stop — it has a vendor now.
    await client.query(
      `DELETE FROM maintenance_vendor_dismissals
        WHERE user_id = $1 AND name_key = $2;`,
      [user_id, key],
    );

    rewritten = rewrite.rowCount;

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Re-read after the commit, outside the transaction's try: the spend readout
  // has to count the rows the rewrite just moved, and a failed read here must
  // not ROLLBACK a transaction that already finished.
  return { vendor: await readVendorRow(db, user_id, vendor_id), rewritten };
}

// ---- REMOVE AN ALIAS (undo a merge) ----
// Only the alias goes. The log rows keep the canonical name they were rewritten
// to — a merge that was wrong is corrected by retyping those rows, not by
// guessing which of them used to say something else.
export async function removeVendorAlias(user_id, vendor_id, alias) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  const errors = validateVendorName(alias, "alias");
  if (errors.length > 0) throw new ValidationError(errors[0]);

  const key = nameKey(alias);

  const current = await db.query(
    `SELECT aliases FROM vendors WHERE user_id = $1 AND vendor_id = $2;`,
    [user_id, vendor_id],
  );
  if (current.rowCount === 0) throw new NotFoundError("Vendor not found");

  const existing = Array.isArray(current.rows[0].aliases)
    ? current.rows[0].aliases
    : [];
  const kept = existing.filter((a) => nameKey(a) !== key);
  if (kept.length === existing.length)
    throw new ValidationError("No such alias on this vendor");

  await db.query(
    `UPDATE vendors SET aliases = $1, updated_at = now()
      WHERE user_id = $2 AND vendor_id = $3;`,
    [kept, user_id, vendor_id],
  );

  return readVendorRow(db, user_id, vendor_id);
}

// The rolodex as the maintenance write path needs it — every spelling of every
// vendor, read on the caller's own client so it sees the same transaction.
export async function listVendorNames(client, user_id) {
  const result = await client.query(
    `SELECT name, aliases FROM vendors WHERE user_id = $1;`,
    [user_id],
  );
  return result.rows;
}

// ---- CREATE VENDOR SERVICE ----
export async function createVendor(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  for (const field in data) {
    if (!VENDOR_FIELDS.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  const errors = validateVendorCreate(data);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const fields = ["user_id"];
  const values = [user_id];
  const placeholders = ["$1"];
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
    INSERT INTO vendors(${fields.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *;
  `;

  const result = await db.query(query, values);
  return result.rows[0];
}

// ---- PATCH VENDOR SERVICE ----
export async function patchVendor(user_id, vendor_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  // Pull audit fields off — they aren't vendor columns.
  const { reason, changed_by, ...vendorData } = data;

  for (const field in vendorData) {
    if (!VENDOR_FIELDS.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }

  const errors = validateVendorPatch(vendorData);
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const updates = [];
  const values = [];
  let index = 1;

  for (const field of VENDOR_FIELDS) {
    if (vendorData[field] !== undefined) {
      updates.push(`${field} = $${index}`);
      values.push(vendorData[field]);
      index++;
    }
  }

  if (updates.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  updates.push(`updated_at = NOW()`);

  const ratingIsChanging = vendorData.rating !== undefined;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // Read the old rating FIRST, on the same client, so the history is accurate.
    let oldRating = null;
    if (ratingIsChanging) {
      const current = await client.query(
        `SELECT rating FROM vendors WHERE user_id=$1 AND vendor_id=$2`,
        [user_id, vendor_id],
      );
      if (current.rowCount === 0) throw new NotFoundError("Vendor not found");
      oldRating = current.rows[0].rating;
    }

    const query = `
      UPDATE vendors
      SET ${updates.join(", ")}
      WHERE user_id = $${index}
        AND vendor_id = $${index + 1}
      RETURNING *;
    `;
    const updateValues = [...values, user_id, vendor_id];
    const result = await client.query(query, updateValues);
    if (result.rowCount === 0) throw new NotFoundError("Vendor not found");

    // Only record history if the rating ACTUALLY changed.
    if (ratingIsChanging && vendorData.rating !== oldRating) {
      if (!reason || !changed_by) {
        throw new ValidationError(
          "Rating changes require a reason and initials",
        );
      }
      const historyResult = await client.query(
        `INSERT INTO vendor_rating_history(vendor_id, old_rating, new_rating, reason, changed_by)
         VALUES($1, $2, $3, $4, $5)
         RETURNING *;`,
        [vendor_id, oldRating, vendorData.rating, reason, changed_by],
      );
      if (historyResult.rowCount === 0)
        throw new Error("Unable to record rating change");
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---- DELETE VENDOR SERVICE ----
export async function deleteVendor(user_id, vendor_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!vendor_id) throw new ValidationError("Missing vendor_id");

  const query = `
    DELETE FROM vendors
    WHERE user_id = $1
    AND vendor_id = $2
    RETURNING *;
  `;

  const result = await db.query(query, [user_id, vendor_id]);
  if (result.rowCount === 0) throw new NotFoundError("Vendor not found");

  return result.rows[0];
}
