import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const isValidType = (t) => t === "fixed" || t === "variable";

// Recompute + persist a period's cogs/expense totals from its lines (lines are
// the source of truth; the period totals are a cache kept in sync on edits).
async function recomputePeriodTotals(user_id, period_id) {
  const res = await db.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE section = 'cogs'), 0) AS cogs_total,
       COALESCE(SUM(amount) FILTER (WHERE section = 'expenses'), 0) AS expense_total
     FROM expense_lines
     WHERE period_id = $1`,
    [period_id],
  );
  const { cogs_total, expense_total } = res.rows[0];
  await db.query(
    `UPDATE expense_periods
       SET cogs_total = $1, expense_total = $2, updated_at = NOW()
     WHERE period_id = $3 AND user_id = $4`,
    [cogs_total, expense_total, period_id, user_id],
  );
}

// Upsert (user, category) → type so future uploads auto-classify.
async function rememberDefault(client, user_id, category, type) {
  await client.query(
    `INSERT INTO expense_category_defaults (user_id, category, type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, category)
       DO UPDATE SET type = EXCLUDED.type, updated_at = NOW()`,
    [user_id, category, type],
  );
}

// ---- SAVE (upsert) A CONFIRMED MONTH ----
// One transaction: upsert the period, replace its lines, remember each
// category's classification.
export async function saveExpensePeriod(user_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const {
    period_month,
    period_label,
    income_total,
    cogs_total,
    expense_total,
    lines,
  } = data;

  if (!period_month) throw new ValidationError("Missing period_month");
  if (!Array.isArray(lines)) throw new ValidationError("lines must be an array");
  for (const line of lines) {
    if (!line.category || line.amount == null || !isValidType(line.type)) {
      throw new ValidationError(
        "each line needs category, amount, and type (fixed|variable)",
      );
    }
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const periodRes = await client.query(
      `INSERT INTO expense_periods
         (user_id, period_month, period_label, income_total, cogs_total, expense_total)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, period_month) DO UPDATE SET
         period_label = EXCLUDED.period_label,
         income_total = EXCLUDED.income_total,
         cogs_total = EXCLUDED.cogs_total,
         expense_total = EXCLUDED.expense_total,
         updated_at = NOW()
       RETURNING period_id`,
      [
        user_id,
        period_month,
        period_label ?? null,
        income_total ?? null,
        cogs_total ?? null,
        expense_total ?? null,
      ],
    );
    const period_id = periodRes.rows[0].period_id;

    await client.query(`DELETE FROM expense_lines WHERE period_id = $1`, [
      period_id,
    ]);

    for (const line of lines) {
      await client.query(
        `INSERT INTO expense_lines (period_id, user_id, category, amount, type, section)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          period_id,
          user_id,
          line.category,
          line.amount,
          line.type,
          line.section ?? "expenses",
        ],
      );
      await rememberDefault(client, user_id, line.category, line.type);
    }

    await client.query("COMMIT");
    return { period_id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---- GET ALL PERIODS ---- (newest first; feeds the YTD chart + month selector)
export async function getExpensePeriods(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT period_id, period_month, period_label, income_total, cogs_total, expense_total
     FROM expense_periods
     WHERE user_id = $1
     ORDER BY period_month DESC`,
    [user_id],
  );
  return result.rows;
}

// ---- GET ONE PERIOD + ITS LINES ----
export async function getExpensePeriod(user_id, period_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!period_id) throw new ValidationError("Missing period_id");

  const periodRes = await db.query(
    `SELECT period_id, period_month, period_label, income_total, cogs_total, expense_total
     FROM expense_periods
     WHERE user_id = $1 AND period_id = $2`,
    [user_id, period_id],
  );
  if (periodRes.rowCount === 0)
    throw new NotFoundError("Expense period not found");

  const linesRes = await db.query(
    `SELECT line_id, category, amount, type, section
     FROM expense_lines
     WHERE period_id = $1
     ORDER BY section, amount DESC`,
    [period_id],
  );

  return { ...periodRes.rows[0], lines: linesRes.rows };
}

// ---- GET CATEGORY DEFAULTS ---- (category → type, for upload auto-classify)
export async function getCategoryDefaults(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT category, type FROM expense_category_defaults WHERE user_id = $1`,
    [user_id],
  );
  return result.rows;
}

// ---- ADD A LINE ----
export async function addExpenseLine(user_id, period_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!period_id) throw new ValidationError("Missing period_id");

  const { category, amount, type, section } = data;
  if (!category || amount == null || !isValidType(type))
    throw new ValidationError("category, amount, and type (fixed|variable) required");

  const check = await db.query(
    `SELECT 1 FROM expense_periods WHERE period_id = $1 AND user_id = $2`,
    [period_id, user_id],
  );
  if (check.rowCount === 0) throw new NotFoundError("Expense period not found");

  const result = await db.query(
    `INSERT INTO expense_lines (period_id, user_id, category, amount, type, section)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING line_id, category, amount, type, section`,
    [period_id, user_id, category, amount, type, section ?? "expenses"],
  );

  const client = await db.pool.connect();
  try {
    await rememberDefault(client, user_id, category, type);
  } finally {
    client.release();
  }
  await recomputePeriodTotals(user_id, period_id);
  return result.rows[0];
}

// ---- PATCH A LINE ---- (edit amount and/or reclassify fixed↔variable)
export async function patchExpenseLine(user_id, line_id, data) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!line_id) throw new ValidationError("Missing line_id");

  const allowedFields = ["amount", "type"];
  const updates = [];
  const values = [];
  let index = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      if (field === "type" && !isValidType(data.type))
        throw new ValidationError("type must be fixed or variable");
      updates.push(`${field} = $${index}`);
      values.push(data[field]);
      index++;
    }
  }
  if (updates.length === 0)
    throw new ValidationError("No valid fields to update");

  updates.push(`updated_at = NOW()`);
  values.push(line_id, user_id);

  const result = await db.query(
    `UPDATE expense_lines
       SET ${updates.join(", ")}
     WHERE line_id = $${index} AND user_id = $${index + 1}
     RETURNING line_id, period_id, category, amount, type, section`,
    values,
  );
  if (result.rowCount === 0) throw new NotFoundError("Expense line not found");
  const line = result.rows[0];

  if (data.type !== undefined) {
    const client = await db.pool.connect();
    try {
      await rememberDefault(client, user_id, line.category, data.type);
    } finally {
      client.release();
    }
  }
  await recomputePeriodTotals(user_id, line.period_id);
  return line;
}

// ---- DELETE A LINE ----
export async function deleteExpenseLine(user_id, line_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!line_id) throw new ValidationError("Missing line_id");

  const result = await db.query(
    `DELETE FROM expense_lines
     WHERE line_id = $1 AND user_id = $2
     RETURNING line_id, period_id`,
    [line_id, user_id],
  );
  if (result.rowCount === 0) throw new NotFoundError("Expense line not found");

  await recomputePeriodTotals(user_id, result.rows[0].period_id);
  return result.rows[0];
}
