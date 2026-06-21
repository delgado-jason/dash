import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import { validateAgentNoteCreate } from "../utils/validation/agentNoteValidation.js";

// ---- CREATE NOTE SERVICE ----
export async function createNote(user_id, agent_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = ["note", "created_by"];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validation
  const errors = validateAgentNoteCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  let fields = ["agent_id"];
  let values = [agent_id];
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

  const agentCheck = await db.query(
    `SELECT 1 FROM agents WHERE agent_id = $1 AND user_id = $2`,
    [agent_id, user_id],
  );

  if (agentCheck.rowCount === 0) throw new NotFoundError("Agent not found");

  const query = `
            INSERT INTO agent_notes(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- DELETE AGENT NOTE SERVICE ----
export async function deleteNote(user_id, note_id) {
  // ... guards ...
  // verify ownership: the note's agent belongs to the user
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!note_id) throw new ValidationError("Missing note_id");

  const query = `
    DELETE FROM agent_notes
    WHERE id = $1
      AND agent_id IN (SELECT agent_id FROM agents WHERE user_id = $2)
    RETURNING *;
  `;
  const result = await db.query(query, [note_id, user_id]);
  if (result.rowCount === 0) throw new NotFoundError("Note not found");
  return result.rows[0];
}
