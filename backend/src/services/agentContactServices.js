import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// One row per touch (either direction). Last-contacted is ALWAYS derived from
// this log — nothing here is a status field.

const FIELDS =
  "contact_id, agent_id, contacted_at, direction, method, type, note, load_id";

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
  const { agent_id, contacted_at, direction, method, type, note, load_id } = data;
  if (!agent_id) throw new ValidationError("agent_id is required");
  if (!["outbound", "inbound"].includes(direction))
    throw new ValidationError("direction must be outbound or inbound");
  if (!["call", "email", "text"].includes(method))
    throw new ValidationError("method must be call, email, or text");
  const TYPES = ["capacity", "check_in", "appreciation", "close_out", "cold", "inbound_inquiry", "other"];
  if (!TYPES.includes(type))
    throw new ValidationError(`type must be one of ${TYPES.join(", ")}`);

  const result = await db.query(
    `INSERT INTO agent_contacts
       (user_id, agent_id, contacted_at, direction, method, type, note, load_id)
     VALUES ($1, $2, COALESCE($3, now()), $4, $5, $6, $7, $8)
     RETURNING ${FIELDS}`,
    [user_id, agent_id, contacted_at ?? null, direction, method, type, note ?? null, load_id ?? null],
  );
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
