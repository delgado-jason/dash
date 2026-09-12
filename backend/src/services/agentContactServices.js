import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import {
  validateAgentContactCreate,
  validateAgentContactPatch,
  PATCHABLE_CONTACT_FIELDS,
} from "../utils/validation/agentContactValidation.js";

// One row per touch (either direction). Last-contacted is ALWAYS derived from
// this log — nothing here is a status field.
//
// next_step_at is a DATE. It goes out as its own text ('YYYY-MM-DD') rather
// than pg's local-midnight Date object, so no zone on either end can move it
// a day — the frontend's slice(0, 10) is then a no-op.
const FIELDS = `contact_id, agent_id, contacted_at, direction, method, type, note, load_id,
  outcome, next_step, next_step_at::text AS next_step_at, footprint_captured,
  combined_types, cap_override`;

export async function getAgentContacts(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${FIELDS} FROM agent_contacts
     WHERE user_id = $1 ORDER BY contacted_at DESC`,
    [user_id],
  );
  return result.rows;
}

export async function createAgentContact(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const errors = validateAgentContactCreate(data ?? {});
  if (errors.length > 0) throw new ValidationError(errors.join("; "), errors);

  const {
    agent_id, contacted_at, direction, method, type, note, load_id,
    outcome, next_step, next_step_at, footprint_captured, combined_types, cap_override,
  } = data;

  const result = await db.query(
    `INSERT INTO agent_contacts
       (user_id, agent_id, contacted_at, direction, method, type, note, load_id,
        outcome, next_step, next_step_at, footprint_captured, combined_types, cap_override)
     VALUES ($1, $2, COALESCE($3, now()), $4, $5, $6, $7, $8,
             $9, $10, $11, COALESCE($12, false), $13, COALESCE($14, false))
     RETURNING ${FIELDS}`,
    [
      user_id, agent_id, contacted_at ?? null, direction, method, type, note ?? null, load_id ?? null,
      outcome ?? null, next_step ?? null, next_step_at ?? null, footprint_captured ?? null,
      combined_types ?? null, cap_override ?? null,
    ],
  );
  return result.rows[0];
}

// The fold ("this Monday message also carried the milestone") and the
// follow-up bookkeeping. The touch's identity is not patchable — see the
// validation module.
export async function patchAgentContact(user_id, contact_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!contact_id) throw new ValidationError("Missing contact_id");
  const errors = validateAgentContactPatch(data ?? {});
  if (errors.length > 0) throw new ValidationError(errors.join("; "), errors);

  // outcome is a call's fact, and a PATCH can't see the method it is bound
  // for — read it first, and refuse the same way create does.
  if (data.outcome != null) {
    const cur = await db.query(
      `SELECT method FROM agent_contacts WHERE contact_id = $1 AND user_id = $2`,
      [contact_id, user_id],
    );
    if (cur.rowCount === 0) throw new NotFoundError("Contact not found");
    if (cur.rows[0].method !== "call") throw new ValidationError("outcome only applies to a call");
  }

  const updates = [];
  const values = [];
  for (const field of PATCHABLE_CONTACT_FIELDS) {
    if (data[field] !== undefined) {
      values.push(data[field]);
      updates.push(`${field} = $${values.length}`);
    }
  }
  const result = await db.query(
    `UPDATE agent_contacts SET ${updates.join(", ")}
     WHERE contact_id = $${values.length + 1} AND user_id = $${values.length + 2}
     RETURNING ${FIELDS}`,
    [...values, contact_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Contact not found");
  return result.rows[0];
}

// Mis-logs happen from a truck stop — deletable, own id only.
export async function deleteAgentContact(user_id, contact_id) {
  if (!contact_id) throw new ValidationError("Missing contact_id");
  const result = await db.query(
    `DELETE FROM agent_contacts WHERE contact_id = $1 AND user_id = $2 RETURNING contact_id`,
    [contact_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Contact not found");
  return true;
}
