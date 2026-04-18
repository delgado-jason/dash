import { db } from "../../db/pool.js";
import {
  validateAgentCreate,
  validateAgentPatch,
} from "../utils/validation/agentValidation.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

// ---- GET AGENTS SERVICE ----
export async function getAgents(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            agent_id,
            brokers.broker_id AS broker_id,
            brokers.broker_name AS broker_name,
            first_name,
            last_name,
            agents.phone AS phone,
            agents.email AS email,
            preferred_contact,
            agents.rating AS rating,
            agents.notes AS notes,
            agents.created_at AS created_at,
            agents.updated_at AS updated_at
        FROM
            agents
        JOIN brokers
        ON agents.broker_id = brokers.broker_id
        WHERE agents.user_id = $1
        ORDER BY last_name;
    `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- GET AGENT SERVICE ----
export async function getAgent(user_id, agent_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agent_id) throw new ValidationError("Missing agent_id");

  const query = `
        SELECT
            agent_id,
            brokers.broker_id AS broker_id,
            brokers.broker_name AS broker_name,
            first_name,
            last_name,
            phone,
            email,
            preferred_contact,
            rating,
            notes,
            agents.created_at AS created_at,
            agents.updated_at AS updated_at
        FROM
            agents
        JOIN brokers
        ON agents.broker_id = brokers.broker_id
        WHERE agents.user_id = $1
        AND agents.agent_id = $2;
    `;

  const result = await db.query(query, [user_id, agent_id]);

  if (result.rowCount === 0) throw new NotFoundError("Agent not found");

  return result.rows[0];
}

// ---- CREATE AGENT SERVICE ----
export async function createAgent(user_id, data) {
  // Reject missing user_id
  if (!user_id) throw new ValidationError("Missing user_id");

  // Reject unknown fields
  const allowedFields = [
    "broker_id",
    "first_name",
    "last_name",
    "phone",
    "email",
    "preferred_contact",
    "rating",
    "notes",
  ];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateLoadCreate
  const errors = validateAgentCreate(data);

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
            INSERT INTO agents(${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING *;
        `;

  const result = await db.query(query, values);

  // Return created row
  return result.rows[0];
}

// ---- PATCH AGENT SERVICE ----
export async function patchAgent(user_id, agent_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agent_id) throw new ValidationError("Missing agent_id");

  // Reject unknown fields
  const allowedFields = [
    "broker_id",
    "first_name",
    "last_name",
    "phone",
    "email",
    "preferred_contact",
    "rating",
    "notes",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in data) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // Must pass validation checks before query request
  const errors = validateAgentPatch(data);

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
        UPDATE agents
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND agent_id = $${index + 1}
        RETURNING *;
      `;

  values.push(user_id, agent_id);

  const result = await db.query(query, values);

  if (result.rowCount === 0) {
    throw new NotFoundError("Agent not found");
  }

  return result.rows[0];
}

// ---- DELETE AGENT SERVICE ----
export async function deleteAgent(user_id, agent_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agent_id) throw new ValidationError("Missing agent_id");

  const query = `
        DELETE FROM agents
        WHERE user_id = $1
        AND agent_id = $2
        RETURNING *;
    `;

  const result = await db.query(query, [user_id, agent_id]);

  if (result.rowCount === 0) throw new NotFoundError("Agent not found");

  return result.rows[0];
}
