import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";

// The identity schedule — net = gross, no carrier. Returned when a user hasn't
// configured one so the app (and the Settings form) always has values to work with.
const DEFAULTS = {
  linehaul_pct: 1,
  trailer_pct: 0,
  fuel_surcharge_pct: 1,
  accessorial_pct: 1,
  carrier_name: null,
  detention_free_hours: 3,
  per_diem_rate: 69,
  per_diem_deduct_pct: 0.8,
  hometime_threshold_days: 21,
};

const PCT_FIELDS = [
  "linehaul_pct",
  "trailer_pct",
  "fuel_surcharge_pct",
  "accessorial_pct",
];

const COLUMNS = [
  ...PCT_FIELDS,
  "carrier_name",
  "detention_free_hours",
  "per_diem_rate",
  "per_diem_deduct_pct",
  "hometime_threshold_days",
];

// ---- GET ---- (always returns a schedule; defaults if none saved yet)
export async function getSettlementSchedule(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${COLUMNS.join(", ")}
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
  for (const f of PCT_FIELDS) {
    if (data[f] === undefined) continue;
    const n = Number(data[f]);
    if (!Number.isFinite(n) || n < 0 || n > 2)
      throw new ValidationError(`${f} must be a fraction between 0 and 2`);
    provided[f] = n;
  }
  const carrierProvided = data.carrier_name !== undefined;
  if (carrierProvided)
    provided.carrier_name = (data.carrier_name ?? "").trim() || null;

  if (data.detention_free_hours !== undefined) {
    const n = Number(data.detention_free_hours);
    if (!Number.isFinite(n) || n < 0 || n > 24)
      throw new ValidationError("detention_free_hours must be between 0 and 24");
    provided.detention_free_hours = n;
  }

  if (data.per_diem_rate !== undefined) {
    const n = Number(data.per_diem_rate);
    if (!Number.isFinite(n) || n < 0 || n > 500)
      throw new ValidationError("per_diem_rate must be between 0 and 500");
    provided.per_diem_rate = n;
  }

  if (data.per_diem_deduct_pct !== undefined) {
    const n = Number(data.per_diem_deduct_pct);
    if (!Number.isFinite(n) || n < 0 || n > 1)
      throw new ValidationError("per_diem_deduct_pct must be a fraction 0–1");
    provided.per_diem_deduct_pct = n;
  }

  if (data.hometime_threshold_days !== undefined) {
    const n = Number(data.hometime_threshold_days);
    if (!Number.isInteger(n) || n < 1 || n > 365)
      throw new ValidationError(
        "hometime_threshold_days must be a whole number between 1 and 365",
      );
    provided.hometime_threshold_days = n;
  }

  if (Object.keys(provided).length === 0)
    throw new ValidationError("No valid fields to update");

  // Merge onto the current (or default) schedule so a partial save is safe.
  const current = await getSettlementSchedule(user_id);
  const m = { ...current, ...provided };

  const result = await db.query(
    `INSERT INTO settlement_schedules
       (user_id, linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct, carrier_name, detention_free_hours, per_diem_rate, per_diem_deduct_pct, hometime_threshold_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id) DO UPDATE SET
       linehaul_pct            = EXCLUDED.linehaul_pct,
       trailer_pct             = EXCLUDED.trailer_pct,
       fuel_surcharge_pct      = EXCLUDED.fuel_surcharge_pct,
       accessorial_pct         = EXCLUDED.accessorial_pct,
       carrier_name            = EXCLUDED.carrier_name,
       detention_free_hours    = EXCLUDED.detention_free_hours,
       per_diem_rate           = EXCLUDED.per_diem_rate,
       per_diem_deduct_pct     = EXCLUDED.per_diem_deduct_pct,
       hometime_threshold_days = EXCLUDED.hometime_threshold_days,
       updated_at              = NOW()
     RETURNING ${COLUMNS.join(", ")}`,
    [
      user_id,
      m.linehaul_pct,
      m.trailer_pct,
      m.fuel_surcharge_pct,
      m.accessorial_pct,
      m.carrier_name,
      m.detention_free_hours,
      m.per_diem_rate,
      m.per_diem_deduct_pct,
      m.hometime_threshold_days,
    ],
  );
  return result.rows[0];
}
