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
  settlement_day: 3, // Wednesday — day of week the weekly settlement lands
  per_diem_rate: 69,
  per_diem_deduct_pct: 0.8,
  hometime_threshold_days: 21,
  operation: "flatbed",
  rate_tier_std_min: 0.1,
  rate_tier_std_target: 0.2,
  rate_tier_std_strong: 0.3,
  rate_tier_spec_min: 0.35,
  rate_tier_spec_target: 0.45,
  rate_tier_spec_strong: 0.6,
  margin_goal: 0.26,
};

const OPERATIONS = [
  "flatbed",
  "heavy haul",
  "oversize",
  "tank",
  "van",
  "reefer",
  "dump",
  "car hauler",
  "other",
];

const PCT_FIELDS = [
  "linehaul_pct",
  "trailer_pct",
  "fuel_surcharge_pct",
  "accessorial_pct",
];

// Two rate-tier sets: Standard (all freight) and Specialized (oversize/hazmat/
// heavy). Each set is a fraction OVER break-even and must ascend internally.
const STD_TIER_FIELDS = [
  "rate_tier_std_min",
  "rate_tier_std_target",
  "rate_tier_std_strong",
];
const SPEC_TIER_FIELDS = [
  "rate_tier_spec_min",
  "rate_tier_spec_target",
  "rate_tier_spec_strong",
];
const TIER_FIELDS = [...STD_TIER_FIELDS, ...SPEC_TIER_FIELDS];

const COLUMNS = [
  ...PCT_FIELDS,
  "carrier_name",
  "detention_free_hours",
  "settlement_day",
  "per_diem_rate",
  "per_diem_deduct_pct",
  "hometime_threshold_days",
  "operation",
  ...TIER_FIELDS,
  "margin_goal",
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

  if (data.settlement_day !== undefined) {
    const n = Number(data.settlement_day);
    if (!Number.isInteger(n) || n < 0 || n > 6)
      throw new ValidationError(
        "settlement_day must be a day of week, 0 (Sunday) through 6 (Saturday)",
      );
    provided.settlement_day = n;
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

  if (data.operation !== undefined) {
    if (!OPERATIONS.includes(data.operation))
      throw new ValidationError(`operation must be one of: ${OPERATIONS.join(", ")}`);
    provided.operation = data.operation;
  }

  for (const f of TIER_FIELDS) {
    if (data[f] === undefined) continue;
    const n = Number(data[f]);
    if (!Number.isFinite(n) || n < 0 || n > 3)
      throw new ValidationError(`${f} must be a fraction between 0 and 3`);
    provided[f] = n;
  }

  if (data.margin_goal !== undefined) {
    const n = Number(data.margin_goal);
    if (!Number.isFinite(n) || n < 0 || n >= 1)
      throw new ValidationError("margin_goal must be a fraction between 0 and 1");
    provided.margin_goal = n;
  }

  if (Object.keys(provided).length === 0)
    throw new ValidationError("No valid fields to update");

  // Merge onto the current (or default) schedule so a partial save is safe.
  const current = await getSettlementSchedule(user_id);
  const m = { ...current, ...provided };

  // Each tier set must ascend: a "good" load can't be worth less than the minimum.
  const ascends = (fields) => {
    const [a, b, c] = fields.map((f) => Number(m[f]));
    return a <= b && b <= c;
  };
  if (!ascends(STD_TIER_FIELDS))
    throw new ValidationError(
      "standard rate tiers must ascend: minimum ≤ target ≤ strong",
    );
  if (!ascends(SPEC_TIER_FIELDS))
    throw new ValidationError(
      "specialized rate tiers must ascend: minimum ≤ target ≤ strong",
    );

  // Build the upsert from COLUMNS so the field list stays in one place.
  const cols = ["user_id", ...COLUMNS];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const updates = COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(",\n       ");
  const values = [user_id, ...COLUMNS.map((c) => m[c])];

  const result = await db.query(
    `INSERT INTO settlement_schedules (${cols.join(", ")})
     VALUES (${placeholders})
     ON CONFLICT (user_id) DO UPDATE SET
       ${updates},
       updated_at = NOW()
     RETURNING ${COLUMNS.join(", ")}`,
    values,
  );
  return result.rows[0];
}
