import { db } from "../../db/pool.js";
import {
  normalizeAgentText,
  validateAgentCreate,
  validateAgentPatch,
  tierChangeGate,
} from "../utils/validation/agentValidation.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../utils/error.js";

// ---- GET AGENTS SERVICE ----
// LEFT JOIN brokers: a prospect may have no agency code yet (073), and an
// inner join would silently drop them from the book.
export async function getAgents(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
        SELECT
            agent_id,
            brokers.broker_id AS broker_id,
            brokers.broker_name AS broker_name,
            first_name,
            last_name,
            relationship_tier,
            tier_set_at,
            agent_city,
            agent_state,
            source,
            agents.phone AS phone,
            agents.email AS email,
            preferred_contact,
            agents.best_time_to_call AS best_time_to_call,
            agents.rating AS rating,
            agents.notes AS notes,
            agents.agent_class AS agent_class,
            agents.work_status AS work_status,
            agents.park_reason AS park_reason,
            agents.freight_types AS freight_types,
            agents.created_at AS created_at,
            agents.updated_at AS updated_at
        FROM
            agents
        LEFT JOIN brokers
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

  const agentQuery = `
        SELECT
            agents.agent_id AS agent_id,
            brokers.broker_id AS broker_id,
            brokers.broker_name AS broker_name,
            agents.first_name AS first_name,
            agents.last_name AS last_name,
            agents.relationship_tier AS relationship_tier,
            agents.tier_set_at AS tier_set_at,
            agents.agent_city AS agent_city,
            agents.agent_state AS agent_state,
            agents.source AS source,
            agents.phone AS phone,
            agents.email AS email,
            agents.preferred_contact AS preferred_contact,
            agents.best_time_to_call AS best_time_to_call,
            agents.rating AS rating,
            agents.notes AS notes,
            agents.agent_class AS agent_class,
            agents.work_status AS work_status,
            agents.park_reason AS park_reason,
            agents.freight_types AS freight_types,
            agents.created_at AS created_at,
            agents.updated_at AS updated_at
        FROM
            agents
        LEFT JOIN brokers
        ON agents.broker_id = brokers.broker_id
        WHERE agents.user_id = $1
        AND agents.agent_id = $2;
    `;

  const agentResult = await db.query(agentQuery, [user_id, agent_id]);

  if (agentResult.rowCount === 0) throw new NotFoundError("Agent not found");

  const loadsQuery = `
    SELECT
            load_id,
            load_number,
            load_type,
            load_status,
            brokers.broker_name AS broker,
            agents.first_name || ' ' || agents.last_name AS agent,
            shipper_name,
            shipper_in,
            shipper_out,
            pickup_appt_start,
            pickup_appt_end,
            pickup_date,
            origin_city,
            origin_state,
            origin_market.market_name AS origin_market,
            receiver_name,
            receiver_in,
            receiver_out,
            delivery_appt_start,
            delivery_appt_end,
            delivery_date,
            destination_city,
            destination_state,
            destination_market.market_name AS delivery_market,
            deadhead_miles,
            loaded_miles,
            linehaul,
            fuel_surcharge,
            (SELECT COALESCE(SUM(amount), 0)
              FROM accessorials
              WHERE load_id = loads.load_id
            ) AS total_accessorials,
            commodity,
            weight,
            length_in,
            width_in,
            height_in,
            odometer_start,
            odometer_end,
            payment_status,
            detention_paid,
            detention_billable,
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
        WHERE loads.user_id = $1
        AND agents.agent_id = $2
        ORDER BY delivery_date DESC;
  `;

  const loadsResult = await db.query(loadsQuery, [user_id, agent_id]);

  const notesQuery = `
    SELECT * 
    FROM agent_notes
    WHERE agent_id = $1
    ORDER BY created_at DESC;
  `;

  const notesResult = await db.query(notesQuery, [agent_id]);

  const ratingHistoryQuery = `
    SELECT *
    FROM agent_rating_history
    WHERE agent_id = $1
    ORDER BY changed_at DESC;
  `;

  const ratingHistoryResult = await db.query(ratingHistoryQuery, [agent_id]);

  return {
    agent: agentResult.rows[0],
    loads: loadsResult.rows,
    notes: notesResult.rows,
    ratingHistory: ratingHistoryResult.rows,
  };
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
    "agent_class",
    "best_time_to_call",
    "agent_city",
    "agent_state",
    "source",
  ];
  // relationship_tier is deliberately NOT here: a new agent has no tier, and
  // the only way to one is the owner's gated PATCH (reason + admin role).

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  // Run validateLoadCreate
  normalizeAgentText(data);
  const errors = validateAgentCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  // A new agent is a Prospect: written as an explicit NULL so the intent holds
  // even if a column default ever comes back (073 dropped the old DEFAULT 3).
  data.relationship_tier = null;

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
// `actor` is req.user — who is making the change (role, self_id). The tier
// rule (REL-01 v2.0 §4) needs it: only the owner sets tiers, always with a
// written reason, and every change lands in agent_tier_history in the SAME
// transaction as the update.
export async function patchAgent(user_id, agent_id, data, actor = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agent_id) throw new ValidationError("Missing agent_id");

  // Pull audit fields off — they aren't agent columns. `reason` serves both
  // the rating history (with `changed_by` initials) and the tier history.
  const { reason, changed_by, ...agentData } = data;

  // Reject unknown fields
  const allowedFields = [
    "broker_id",
    "first_name",
    "last_name",
    "phone",
    "email",
    "preferred_contact",
    "best_time_to_call",
    "rating",
    "notes",
    "agent_class",
    "work_status",
    "park_reason",
    "freight_types",
    "relationship_tier",
    "tier_set_at", // stamped server-side on a real retier — never client-set
    "agent_city",
    "agent_state",
    "source",
  ];

  // Throw error if data contains invalid field(s)
  for (const field in agentData) {
    if (!allowedFields.includes(field))
      throw new ValidationError(`${field} not allowed`);
  }
  // ---- VALIDATION LOGIC ----

  // tier_set_at is SERVER truth — a client-sent value is dropped; the retier
  // (if the tier actually changes) stamps it inside the transaction below.
  delete agentData.tier_set_at;

  // Must pass validation checks before query request
  normalizeAgentText(agentData);
  const errors = validateAgentPatch(agentData);

  // if errors, reject request
  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const fieldsToSet = allowedFields.filter((f) => agentData[f] !== undefined);

  // Check if no fields provided
  if (fieldsToSet.length === 0) {
    throw new ValidationError("No valid fields provided for update");
  }

  const ratingIsChanging = agentData.rating !== undefined;
  const tierInPatch = agentData.relationship_tier !== undefined;

  // ---- Transaction ----
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // Anything judged against the STORED value is read first, on this same
    // client, locked for the length of the transaction.
    let current = { rating: null, relationship_tier: null };
    if (ratingIsChanging || tierInPatch) {
      const cur = await client.query(
        `SELECT rating, relationship_tier FROM agents
         WHERE user_id=$1 AND agent_id=$2 FOR UPDATE`,
        [user_id, agent_id],
      );
      if (cur.rowCount === 0) throw new NotFoundError("Agent not found");
      current = cur.rows[0];
    }
    const oldRating = current.rating;

    // The tier rule. A patch that repeats the stored tier is not a change and
    // needs neither role nor reason; a real move needs both.
    const gate = tierInPatch
      ? tierChangeGate({
          from: current.relationship_tier,
          to: agentData.relationship_tier,
          reason,
          role: actor.role,
        })
      : { changed: false, error: null };
    if (gate.error) {
      throw gate.error.status === 403
        ? new ForbiddenError(gate.error.message)
        : new ValidationError(gate.error.message);
    }

    const updates = [];
    const values = [];
    let index = 1;
    for (const field of fieldsToSet) {
      updates.push(`${field} = $${index}`);
      values.push(agentData[field]);
      index++;
    }
    // Retiering stamps WHEN the call was made — server-side, not client-claimed.
    if (gate.changed) updates.push(`tier_set_at = NOW()`);
    // Always update timestamp
    updates.push(`updated_at = NOW()`);

    // The agent UPDATE
    const query = `
        UPDATE agents
        SET ${updates.join(", ")}
        WHERE user_id = $${index}
          AND agent_id = $${index + 1}
        RETURNING *;
      `;
    const updateValues = [...values, user_id, agent_id];
    const result = await client.query(query, updateValues);
    if (result.rowCount === 0) throw new NotFoundError("Agent not found");

    // The tier's paper trail: from → to, why, who, when. source 'owner' —
    // this path is always a human decision.
    if (gate.changed) {
      await client.query(
        `INSERT INTO agent_tier_history
           (user_id, agent_id, from_tier, to_tier, reason, source, changed_by)
         VALUES ($1, $2, $3, $4, $5, 'owner', $6)`,
        [
          user_id,
          agent_id,
          current.relationship_tier,
          agentData.relationship_tier,
          reason.trim(),
          actor.self_id ?? null,
        ],
      );
    }

    // Conditionally insert history — only if rating ACTUALLY changed
    if (ratingIsChanging && agentData.rating !== oldRating) {
      if (!reason || !changed_by) {
        throw new ValidationError(
          "Rating changes require a reason and initials",
        );
      }
      const historyResult = await client.query(
        `INSERT INTO agent_rating_history(agent_id, old_rating, new_rating, reason, changed_by)
         VALUES($1, $2, $3, $4, $5)
         RETURNING *;
        `,
        [agent_id, oldRating, agentData.rating, reason, changed_by],
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
