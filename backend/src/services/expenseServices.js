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

// ---- GET YTD CATEGORY ROLLUP ----
// Spending by category across one calendar year (all sections). One GROUP BY so
// the dashboard's "where it goes" card doesn't have to pull every month's lines
// and re-sum them client-side. Amount comes back as a numeric string — coerce.
export async function getExpenseCategoryRollup(user_id, year) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 3000)
    throw new ValidationError("year must be a 4-digit year");

  const start = `${y}-01-01`;
  const end = `${y + 1}-01-01`;
  const result = await db.query(
    `SELECT l.category, l.section, SUM(l.amount) AS amount
       FROM expense_lines l
       JOIN expense_periods p ON p.period_id = l.period_id
      WHERE l.user_id = $1
        AND p.period_month >= $2::date
        AND p.period_month <  $3::date
      GROUP BY l.category, l.section
      ORDER BY SUM(l.amount) DESC`,
    [user_id, start, end],
  );
  return result.rows;
}

// ---- GET CATEGORY DEFAULTS ---- (category → type, for upload auto-classify)
export async function getCategoryDefaults(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT category, type, cuttability FROM expense_category_defaults WHERE user_id = $1`,
    [user_id],
  );
  return result.rows;
}

// The cost-cut tiers the planner + Settings recognize. NULL cuttability = auto.
export const CUT_TIERS = [
  "off_limits",
  "essential",
  "discretionary",
  "deferrable",
  "efficiency",
  "last_resort",
];

const monthKey = (v) =>
  (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

// Per-category cost picture for the Market cut planner: the latest month's spend
// (current) + the trailing monthly average (baseline, over the up-to-6 months
// before it, treating absent months as $0) + the saved type/cuttability. The
// planner tiers each category; this just supplies the dollars and the override.
export async function getCutTierData(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const { rows } = await db.query(
    `SELECT l.category, l.section, p.period_month, SUM(l.amount)::float8 AS amt
       FROM expense_lines l
       JOIN expense_periods p ON p.period_id = l.period_id
      WHERE l.user_id = $1
      GROUP BY l.category, l.section, p.period_month`,
    [user_id],
  );
  if (rows.length === 0) return [];

  const { rows: defs } = await db.query(
    `SELECT category, type, cuttability FROM expense_category_defaults WHERE user_id = $1`,
    [user_id],
  );
  const defByCat = new Map(defs.map((d) => [d.category, d]));

  const maxMonth = rows.reduce(
    (mx, r) => (monthKey(r.period_month) > mx ? monthKey(r.period_month) : mx),
    "0000-00-00",
  );
  const md = new Date(maxMonth);
  const baseCutoff = new Date(
    Date.UTC(md.getUTCFullYear(), md.getUTCMonth() - 6, 1),
  )
    .toISOString()
    .slice(0, 10);

  const byCat = new Map();
  for (const r of rows) {
    const m = monthKey(r.period_month);
    const e =
      byCat.get(r.category) ??
      { category: r.category, section: r.section, current: 0, baseSum: 0, baseMonths: new Set() };
    e.section = r.section;
    if (m === maxMonth) e.current += r.amt;
    else if (m >= baseCutoff && m < maxMonth) {
      e.baseSum += r.amt;
      e.baseMonths.add(m); // PER-CATEGORY: a category new this month has none
    }
    byCat.set(r.category, e);
  }

  return [...byCat.values()]
    .map((e) => {
      const def = defByCat.get(e.category);
      const n = e.baseMonths.size;
      return {
        category: e.category,
        section: e.section,
        type: def?.type ?? null,
        cuttability: def?.cuttability ?? null,
        current: Math.round(e.current),
        // No baseline history for THIS category → baseline = current, so a brand-new
        // (or lumpy quarterly) cost isn't mislabeled as "overspend" and cut first.
        baseline: n > 0 ? Math.round(e.baseSum / n) : Math.round(e.current),
      };
    })
    .sort((a, b) => b.baseline - a.baseline);
}

// Pin (or clear, with null) a category's cost-cut tier. Upserts onto the
// per-user default row, inventing a type only if the category has none yet.
export async function setCuttability(user_id, category, cuttability) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!category || typeof category !== "string")
    throw new ValidationError("category is required");
  if (cuttability != null && !CUT_TIERS.includes(cuttability))
    throw new ValidationError("invalid cuttability tier");
  await db.query(
    `INSERT INTO expense_category_defaults (user_id, category, type, cuttability)
     VALUES ($1::uuid, $2::varchar,
       COALESCE(
         (SELECT type FROM expense_category_defaults WHERE user_id = $1::uuid AND category = $2::varchar),
         'variable'::expense_type
       ),
       $3::cut_tier)
     ON CONFLICT (user_id, category)
       DO UPDATE SET cuttability = EXCLUDED.cuttability, updated_at = NOW()`,
    [user_id, category, cuttability],
  );
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
