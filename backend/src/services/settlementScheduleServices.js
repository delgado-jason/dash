import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";
import {
  validateSchedule,
  TIER_FIELDS,
} from "../utils/validation/settlementScheduleValidation.js";

// The undated settings (the pay split lives in settlement_splits, dated — NET-01).
// Returned when a user hasn't configured one.
// (was: the identity schedule — net = gross, no carrier.) Returned when a user hasn't
// configured one so the app (and the Settings form) always has values to work with.
export const DEFAULTS = {
  carrier_name: null,
  detention_free_hours: 3,
  settlement_day: 3, // Wednesday — day of week the weekly settlement lands
  deposit_lag_days: 1, // the cash lands this many days after the settlement (#502)
  per_diem_deduct_pct: 0.8,
  hometime_threshold_days: 42, // GL-140 (Jason, 2026-11-05)
  operation: "flatbed",
  rate_tier_std_min: 0.1,
  rate_tier_std_target: 0.2,
  rate_tier_std_strong: 0.3,
  rate_tier_spec_min: 0.35,
  rate_tier_spec_target: 0.45,
  rate_tier_spec_strong: 0.6,
  margin_goal: 0.26,
};

const COLUMNS = [
  "carrier_name",
  "detention_free_hours",
  "settlement_day",
  "deposit_lag_days",
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

  // NET-06: every refusal lives in the pure validator. The first pass judges
  // what arrives (a blank is refused, never read as 0); the second, after
  // the stored schedule is read, judges the merge (tier order).
  const first = validateSchedule(data);
  if (first.errors.length > 0) throw new ValidationError(first.errors[0], first.errors);
  const provided = first.values;

  if (Object.keys(provided).length === 0)
    throw new ValidationError("No valid fields to update");

  // Merge onto the current (or default) schedule so a partial save is safe.
  const current = await getSettlementSchedule(user_id);
  const m = { ...current, ...provided };
  const merged = validateSchedule(data, current);
  if (merged.errors.length > 0) throw new ValidationError(merged.errors[0], merged.errors);

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
