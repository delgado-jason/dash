import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import { validateAgentCoverageCreate } from "../utils/validation/agentCoverageValidation.js";

// Coverage is what an agent SAYS they cover — claimed intel, deliberately kept
// out of `facilities` (which stays a factual record of where the truck has been).
// `source` is the confidence flag: 'stated' until a load proves it 'confirmed'.

// ---- LIST COVERAGE SERVICE ----
// The whole set for this user, small enough to return in one pass (one row per
// market an agent named). The Foreman keys it by "CITY,ST" against city_coords,
// the same way it already keys booked origins.
export async function listCoverage(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const query = `
    SELECT coverage_id, agent_id, city, state, shipper_name,
           source, confirmed_load_id, notes, created_at
    FROM agent_coverage
    WHERE user_id = $1
    ORDER BY state, city, shipper_name NULLS FIRST;
  `;

  const result = await db.query(query, [user_id]);

  return result.rows;
}

// ---- CREATE COVERAGE SERVICE ----
export async function createCoverage(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const allowedFields = ["agent_id", "city", "state", "shipper_name", "notes"];

  for (const field in data) {
    if (!allowedFields.includes(field)) {
      throw new ValidationError(`${field} not allowed`);
    }
  }

  const errors = validateAgentCoverageCreate(data);

  if (errors.length > 0) throw new ValidationError("Validation failed", errors);

  const agentCheck = await db.query(
    `SELECT 1 FROM agents WHERE agent_id = $1 AND user_id = $2`,
    [data.agent_id, user_id],
  );

  if (agentCheck.rowCount === 0) throw new NotFoundError("Agent not found");

  // Normalized on the way in so a row always keys against city_coords, which
  // stores city_norm UPPERCASED and state as a 2-letter UPPERCASE code.
  const city = data.city.trim();
  const state = data.state.trim().toUpperCase();
  const shipper_name = data.shipper_name?.trim() || null;

  // Re-stating a market the agent already named is a no-op, not an error — she
  // is on a call and should never be stopped by a duplicate. Returns the
  // existing row so the client can render the chip either way.
  const query = `
    INSERT INTO agent_coverage (user_id, agent_id, city, state, shipper_name, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (agent_id, city, state, shipper_name) DO UPDATE
      SET notes = COALESCE(EXCLUDED.notes, agent_coverage.notes),
          updated_at = now()
    RETURNING coverage_id, agent_id, city, state, shipper_name,
              source, confirmed_load_id, notes, created_at;
  `;

  const result = await db.query(query, [
    user_id,
    data.agent_id,
    city,
    state,
    shipper_name,
    data.notes?.trim() || null,
  ]);

  return result.rows[0];
}

// ---- DELETE COVERAGE SERVICE ----
export async function deleteCoverage(user_id, coverage_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!coverage_id) throw new ValidationError("Missing coverage_id");

  const query = `
    DELETE FROM agent_coverage
    WHERE coverage_id = $1 AND user_id = $2
    RETURNING *;
  `;

  const result = await db.query(query, [coverage_id, user_id]);

  if (result.rowCount === 0) throw new NotFoundError("Coverage not found");

  return result.rows[0];
}
