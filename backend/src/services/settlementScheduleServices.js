import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";

// The identity schedule — net = gross. Returned when a user hasn't configured one
// so the app (and the Settings form) always has values to work with.
const DEFAULTS = {
  linehaul_pct: 1,
  trailer_pct: 0,
  fuel_surcharge_pct: 1,
  accessorial_pct: 1,
};

const FIELDS = [
  "linehaul_pct",
  "trailer_pct",
  "fuel_surcharge_pct",
  "accessorial_pct",
];

// ---- GET ---- (always returns a schedule; defaults if none saved yet)
export async function getSettlementSchedule(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${FIELDS.join(", ")}
       FROM settlement_schedules
      WHERE user_id = $1`,
    [user_id],
  );
  return result.rows[0] ?? { ...DEFAULTS };
}

// ---- UPSERT ---- (partial: only provided fields change, the rest are kept)
export async function upsertSettlementSchedule(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const provided = {};
  for (const f of FIELDS) {
    if (data[f] === undefined) continue;
    const n = Number(data[f]);
    if (!Number.isFinite(n) || n < 0 || n > 2)
      throw new ValidationError(`${f} must be a fraction between 0 and 2`);
    provided[f] = n;
  }
  if (Object.keys(provided).length === 0)
    throw new ValidationError("No valid fields to update");

  // Merge onto the current (or default) schedule so a partial save is safe.
  const current = await getSettlementSchedule(user_id);
  const m = { ...current, ...provided };

  const result = await db.query(
    `INSERT INTO settlement_schedules
       (user_id, linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       linehaul_pct       = EXCLUDED.linehaul_pct,
       trailer_pct        = EXCLUDED.trailer_pct,
       fuel_surcharge_pct = EXCLUDED.fuel_surcharge_pct,
       accessorial_pct    = EXCLUDED.accessorial_pct,
       updated_at         = NOW()
     RETURNING ${FIELDS.join(", ")}`,
    [user_id, m.linehaul_pct, m.trailer_pct, m.fuel_surcharge_pct, m.accessorial_pct],
  );
  return result.rows[0];
}
