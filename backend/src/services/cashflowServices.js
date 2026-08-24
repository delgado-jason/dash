import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";

// Cash-flow planning layer: assumptions (one typed row), the monthly QBO
// archive (permanent — upsert only, never delete), and per-month forecast
// adjustments (planned home-time weeks).

const ASSUMPTION_FIELDS = [
  "weekly_revenue",
  "weekly_payroll",
  "monthly_depreciation",
  "fed_tax_rate",
  "state_tax_rate",
  "financing_floor",
  "tax_catchup_owed",
];

export async function getAssumptions(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT ${ASSUMPTION_FIELDS.join(", ")} FROM cash_assumptions WHERE user_id = $1`,
    [user_id],
  );
  return result.rows[0] ?? null;
}

export async function patchAssumptions(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const updates = [];
  const values = [];
  let i = 1;
  for (const f of ASSUMPTION_FIELDS) {
    if (data[f] !== undefined) {
      updates.push(`${f} = $${i++}`);
      values.push(data[f]);
    }
  }
  if (updates.length === 0) throw new ValidationError("No editable fields provided");
  values.push(user_id);
  // The row is normally seeded, but a fresh user edits into existence.
  await db.query(
    `INSERT INTO cash_assumptions (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user_id],
  );
  const upd = await db.query(
    `UPDATE cash_assumptions SET ${updates.join(", ")}, updated_at = NOW()
     WHERE user_id = $${i}
     RETURNING ${ASSUMPTION_FIELDS.join(", ")}`,
    values,
  );
  return upd.rows[0];
}

const FINANCIAL_FIELDS = [
  "month",
  "total_income",
  "total_cogs",
  "total_opex",
  "interest_expense",
  "net_income",
  "beginning_cash",
  "operating_adjustments",
  "investing",
  "financing",
  "ending_cash",
  "accounts_receivable",
  "total_liabilities",
  "total_equity",
  "depreciation",
];

export async function getFinancials(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT to_char(month, 'YYYY-MM-DD') AS month,
            ${FINANCIAL_FIELDS.filter((f) => f !== "month").join(", ")}
     FROM monthly_financials
     WHERE user_id = $1 ORDER BY month`,
    [user_id],
  );
  return result.rows;
}

// Bulk upsert from the paste importer — one call, all rows, transactional so a
// bad row rejects the whole paste (the preview should have caught it, but the
// archive never takes half a paste).
export async function upsertFinancials(user_id, rows) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!Array.isArray(rows) || rows.length === 0)
    throw new ValidationError("rows must be a non-empty array");
  if (rows.length > 120)
    throw new ValidationError("too many rows in one paste (max 120)");
  for (const r of rows) {
    if (typeof r.month !== "string" || !/^\d{4}-\d{2}-01$/.test(r.month))
      throw new ValidationError(`Row ${r.month ?? "?"}: month must be YYYY-MM-01`);
    for (const f of FINANCIAL_FIELDS) {
      if (f === "month") continue;
      if (r[f] === undefined || r[f] === null || r[f] === "" || !Number.isFinite(Number(r[f])))
        throw new ValidationError(`Row ${r.month}: bad ${f}`);
    }
  }
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const out = [];
    for (const r of rows) {
      const res = await client.query(
        `INSERT INTO monthly_financials (user_id, ${FINANCIAL_FIELDS.join(", ")})
         VALUES ($1, ${FINANCIAL_FIELDS.map((_, i) => `$${i + 2}`).join(", ")})
         ON CONFLICT (user_id, month) DO UPDATE SET
           ${FINANCIAL_FIELDS.filter((f) => f !== "month")
             .map((f) => `${f} = EXCLUDED.${f}`)
             .join(", ")},
           updated_at = NOW()
         RETURNING to_char(month, 'YYYY-MM-DD') AS month,
                   ${FINANCIAL_FIELDS.filter((f) => f !== "month").join(", ")}`,
        [user_id, ...FINANCIAL_FIELDS.map((f) => r[f])],
      );
      out.push(res.rows[0]);
    }
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getAdjustments(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT to_char(month, 'YYYY-MM-DD') AS month, weeks_off
     FROM forecast_adjustments WHERE user_id = $1 ORDER BY month`,
    [user_id],
  );
  return result.rows;
}

export async function setAdjustment(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { month, weeks_off } = data;
  if (typeof month !== "string" || !/^\d{4}-\d{2}-01$/.test(month))
    throw new ValidationError("month must be YYYY-MM-01");
  const w = Number(weeks_off);
  if (!Number.isFinite(w) || w < 0 || w > 8)
    throw new ValidationError("weeks_off must be between 0 and 8");
  const result = await db.query(
    `INSERT INTO forecast_adjustments (user_id, month, weeks_off)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, month) DO UPDATE SET weeks_off = EXCLUDED.weeks_off, updated_at = NOW()
     RETURNING to_char(month, 'YYYY-MM-DD') AS month, weeks_off`,
    [user_id, month, w],
  );
  return result.rows[0];
}
