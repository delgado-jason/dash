import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../utils/error.js";
import {
  holdReason,
  validateTierHistoryQuery,
  validateTierHold,
} from "../utils/validation/agentTierHistoryValidation.js";

// The tier's paper trail (073, decision 8). Every row here is a human
// decision — a move written by the gated PATCH, or a HOLD written below. The
// account scope is user_id; names are joined so the Review can print
// "{Mon d} · {name} {code} · Tier 2 → Tier 1 · '{reason}' · {who}" without a
// second lookup. LEFT JOINs: a prospect may have no agency code, and the
// person who signed may since have left the account.
const FIELDS = `h.history_id, h.agent_id, h.from_tier, h.to_tier, h.reason, h.source,
  h.changed_by, h.changed_at,
  a.first_name, a.last_name, b.broker_name,
  u.display_name AS changed_by_name`;
const FROM = `FROM agent_tier_history h
  JOIN agents a ON a.agent_id = h.agent_id
  LEFT JOIN brokers b ON b.broker_id = a.broker_id
  LEFT JOIN users u ON u.user_id = h.changed_by`;

export async function getTierHistory(user_id, query = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const errors = validateTierHistoryQuery(query);
  if (errors.length > 0) throw new ValidationError(errors.join("; "), errors);

  // Both filters stay — they are part of this endpoint's contract and tested —
  // but the Review deliberately asks for the WHOLE trail: hold suppression
  // compares against each agent's LATEST hold row, and a hold set months ago
  // on evidence that still has not moved would fall outside any `since`
  // window and quietly bring every suppressed suggestion back.
  const where = ["h.user_id = $1"];
  const values = [user_id];
  if (query.since) {
    values.push(query.since);
    where.push(`h.changed_at >= $${values.length}::date`);
  }
  if (query.agent_id) {
    values.push(query.agent_id);
    where.push(`h.agent_id = $${values.length}`);
  }
  const result = await db.query(
    `SELECT ${FIELDS} ${FROM} WHERE ${where.join(" AND ")} ORDER BY h.changed_at DESC`,
    values,
  );
  return result.rows;
}

// The owner's HOLD on a suggestion: from_tier = to_tier = the tier as stored
// RIGHT NOW (read under lock, so a concurrent PATCH can't slip between the
// read and the write), source 'owner', reason "hold — {evidence}". Nothing on
// the agent row changes — a hold is a note in the trail, not a move.
export async function holdTier(user_id, agent_id, data, actor = {}) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!agent_id) throw new ValidationError("Missing agent_id");
  // Same gate as the tier PATCH: the tier is the owner's, and so is holding it.
  if (actor.role !== "admin") throw new ForbiddenError("Only the owner sets tiers.");
  const errors = validateTierHold(data);
  if (errors.length > 0) throw new ValidationError(errors.join("; "), errors);

  const client = await db.pool.connect();
  let historyId;
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT relationship_tier FROM agents WHERE user_id = $1 AND agent_id = $2 FOR UPDATE`,
      [user_id, agent_id],
    );
    if (cur.rowCount === 0) throw new NotFoundError("Agent not found");
    const tier = cur.rows[0].relationship_tier;
    const ins = await client.query(
      `INSERT INTO agent_tier_history
         (user_id, agent_id, from_tier, to_tier, reason, source, changed_by)
       VALUES ($1, $2, $3, $3, $4, 'owner', $5)
       RETURNING history_id`,
      [user_id, agent_id, tier, holdReason(data.reason), actor.self_id ?? null],
    );
    historyId = ins.rows[0].history_id;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const row = await db.query(`SELECT ${FIELDS} ${FROM} WHERE h.history_id = $1`, [historyId]);
  return row.rows[0];
}
