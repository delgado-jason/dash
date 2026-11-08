import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError, ConflictError } from "../utils/error.js";
import { validateSettlementSplit } from "../utils/validation/settlementSplitValidation.js";
import { monthDay } from "../utils/validation/moneyFields.js";

// NET-01 · dated settlement splits. A load settles on the split with the latest
// effective_from on or before its delivery day. effective_from is a DATE,
// returned as 'YYYY-MM-DD'; the pcts are numeric, coerced to Numbers.
const RETURNING = `split_id,
  to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
  linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct,
  note, created_at, updated_at`;

const PCTS = ["linehaul_pct", "trailer_pct", "fuel_surcharge_pct", "accessorial_pct"];

const shape = (row) => {
  if (!row) return row;
  const out = { ...row };
  for (const f of PCTS) out[f] = Number(row[f]);
  return out;
};

const longDay = (ymd) => `${monthDay(ymd)}, ${String(ymd).slice(0, 4)}`;

const conflict = (day) =>
  new ConflictError(`a schedule already starts on ${longDay(day)} — edit that row instead`);

function check(data, opts) {
  const { values, errors } = validateSettlementSplit(data, opts);
  if (errors.length > 0) throw new ValidationError(errors[0], errors);
  return values;
}

export async function listSettlementSplits(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${RETURNING}
       FROM settlement_splits
      WHERE user_id = $1
      ORDER BY effective_from DESC`,
    [user_id],
  );
  return result.rows.map(shape);
}

export async function createSettlementSplit(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const v = check(data, { partial: false });
  try {
    const result = await db.query(
      `INSERT INTO settlement_splits
              (user_id, effective_from, linehaul_pct, trailer_pct, fuel_surcharge_pct, accessorial_pct, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${RETURNING}`,
      [
        user_id,
        v.effective_from,
        v.linehaul_pct,
        v.trailer_pct,
        v.fuel_surcharge_pct,
        v.accessorial_pct,
        v.note ?? null,
      ],
    );
    return shape(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") throw conflict(v.effective_from);
    throw err;
  }
}

export async function updateSettlementSplit(user_id, split_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!split_id) throw new ValidationError("Missing split_id");
  // First pass: what arrives. Second, after the stored row is read: the merge
  // (a patch of only trailer_pct is judged against the stored linehaul_pct).
  const first = check(data, { partial: true });
  if (Object.keys(first).length === 0) throw new ValidationError("Nothing to update");

  const stored = await db.query(
    `SELECT ${RETURNING} FROM settlement_splits WHERE user_id = $1 AND split_id = $2`,
    [user_id, split_id],
  );
  if (stored.rowCount === 0) throw new NotFoundError("no settlement split with that id");
  const v = check(data, { partial: true, current: shape(stored.rows[0]) });

  const cols = Object.keys(v);
  const sets = cols.map((c, i) => `${c} = $${i + 3}`);
  try {
    const result = await db.query(
      `UPDATE settlement_splits
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE user_id = $1 AND split_id = $2
        RETURNING ${RETURNING}`,
      [user_id, split_id, ...cols.map((c) => v[c])],
    );
    if (result.rowCount === 0) throw new NotFoundError("no settlement split with that id");
    return shape(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") throw conflict(v.effective_from);
    throw err;
  }
}

export async function deleteSettlementSplit(user_id, split_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!split_id) throw new ValidationError("Missing split_id");

  const all = await db.query(
    `SELECT split_id, to_char(effective_from, 'YYYY-MM-DD') AS effective_from
       FROM settlement_splits
      WHERE user_id = $1
      ORDER BY effective_from ASC`,
    [user_id],
  );
  const rows = all.rows;
  const idx = rows.findIndex((r) => r.split_id === split_id);
  if (idx === -1) throw new NotFoundError("no settlement split with that id");
  if (rows.length === 1)
    throw new ValidationError("the last split can't be removed — every load needs one in force");

  // Removing a later row hands its days to the row before it. Removing the
  // EARLIEST row leaves its days with no split in force, if any load sits there.
  if (idx === 0) {
    const from = rows[0].effective_from;
    const next = rows[1].effective_from;
    const stranded = await db.query(
      `SELECT load_number,
              to_char(COALESCE(delivery_date, pickup_date, CURRENT_DATE), 'YYYY-MM-DD') AS day
         FROM loads
        WHERE user_id = $1
          AND COALESCE(delivery_date, pickup_date, CURRENT_DATE) >= $2::date
          AND COALESCE(delivery_date, pickup_date, CURRENT_DATE) < $3::date
        ORDER BY COALESCE(delivery_date, pickup_date, CURRENT_DATE) ASC
        LIMIT 1`,
      [user_id, from, next],
    );
    if (stranded.rowCount > 0) {
      const l = stranded.rows[0];
      throw new ValidationError(
        `removing the ${longDay(from)} schedule would leave load ${l.load_number} (${longDay(l.day)}) without a split — start a new schedule from that day first`,
      );
    }
  }

  const result = await db.query(
    `DELETE FROM settlement_splits WHERE user_id = $1 AND split_id = $2`,
    [user_id, split_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("no settlement split with that id");
  return true;
}
