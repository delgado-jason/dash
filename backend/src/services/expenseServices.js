import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";
import { validateExpensePeriod } from "../utils/validation/expensePeriodValidation.js";

const isValidType = (t) => t === "fixed" || t === "variable";

// Recompute + persist a period's cogs/expense totals from its lines (lines are
// the source of truth; the period totals are a cache kept in sync on edits).
async function recomputePeriodTotals(user_id, period_id) {
  // A period with no lines left keeps NULL totals, never $0: a zero would read
  // as a free month in the cost basis (2026-11-04). With lines, a section with
  // none of its own is a true $0.
  const res = await db.query(
    `SELECT
       CASE WHEN COUNT(*) = 0 THEN NULL ELSE COALESCE(SUM(amount) FILTER (WHERE section = 'cogs'), 0) END AS cogs_total,
       CASE WHEN COUNT(*) = 0 THEN NULL ELSE COALESCE(SUM(amount) FILTER (WHERE section = 'expenses'), 0) END AS expense_total
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
  // A month without its totals reads as a free month everywhere the cost
  // basis is built (2026-11-01: October saved with nulls dropped every rung).
  // The totals must be numbers — zero is a number; missing is refused.
  const finite = (v) =>
    (typeof v === "number" && Number.isFinite(v)) ||
    (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
  if (!finite(income_total) || !finite(cogs_total) || !finite(expense_total)) {
    throw new ValidationError(
      "a month needs its income, cost of goods sold and expense totals — this file didn't carry them; re-export the P&L with its section totals",
    );
  }
  if (!Array.isArray(lines)) throw new ValidationError("lines must be an array");
  for (const line of lines) {
    if (!line.category || line.amount == null || !isValidType(line.type)) {
      throw new ValidationError(
        "each line needs category, amount, and type (fixed|variable)",
      );
    }
  }

  // PNL-05: the server re-reconciles what the UI checks: a real first-of-month
  // period, numeric amounts, a known section, and lines that add to the totals.
  const refusals = validateExpensePeriod({
    period_month,
    totals: { income_total, cogs_total, expense_total },
    lines,
  });
  if (refusals.length > 0) throw new ValidationError(refusals[0], refusals);

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
  // The fixed/variable split rides along with the LIST, not just with a single
  // period's lines. The rate basis divides fixed cost by the committed monthly
  // mileage (migration 109), and that basis is read by the Dashboard, the
  // Market page, the Foreman and the Load Scorer — none of which fetch lines.
  // Computing it here means one query answers all of them instead of each
  // surface pulling every month's lines and re-summing them.
  //
  // Same read-through as the lines themselves (EXPTYPE-01): the CATEGORY's
  // current type, never the one stored on the line.
  //
  // A month with no lines returns NULL for both, not 0 — a zero would read as
  // a month that genuinely had no fixed cost and drag the whole blend down.
  const result = await db.query(
    `SELECT p.period_id, p.period_month, p.period_label,
            p.income_total, p.cogs_total, p.expense_total,
            p.created_at AS filed_at,
            t.fixed_total, t.variable_total
     FROM expense_periods p
     LEFT JOIN LATERAL (
       SELECT SUM(l.amount) FILTER (WHERE COALESCE(d.type, l.type) = 'fixed')    AS fixed_total,
              SUM(l.amount) FILTER (WHERE COALESCE(d.type, l.type) = 'variable') AS variable_total
         FROM expense_lines l
         LEFT JOIN expense_category_defaults d
                ON d.user_id = l.user_id AND d.category = l.category
        WHERE l.period_id = p.period_id
     ) t ON TRUE
     WHERE p.user_id = $1
     ORDER BY p.period_month DESC`,
    [user_id],
  );
  return result.rows;
}

// ---- GET ONE PERIOD + ITS LINES ----
export async function getExpensePeriod(user_id, period_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!period_id) throw new ValidationError("Missing period_id");

  const periodRes = await db.query(
    `SELECT period_id, period_month, period_label, income_total, cogs_total, expense_total, created_at AS filed_at
     FROM expense_periods
     WHERE user_id = $1 AND period_id = $2`,
    [user_id, period_id],
  );
  if (periodRes.rowCount === 0)
    throw new NotFoundError("Expense period not found");

  // THE TYPE IS READ THROUGH THE DEFAULTS, not off the line.
  //
  // `expense_lines.type` is whatever was true at upload time; the current
  // answer lives in expense_category_defaults, one row per category. Nothing
  // reconciled them, so they drifted: on 2026-07-09 four months were backfilled
  // as `variable`, May was then flipped to `fixed`, and June was created in the
  // same minute and kept the old value. Four of ten months disagreed with the
  // other six, and nothing said so.
  //
  // That is not cosmetic. The fixed share feeds the sit/run burn, which feeds
  // the landing page's leave reserve, so "cost to sit" was understating a
  // parked day by $293 a week.
  //
  // COALESCE and not a join-or-fail: a category with no default row at all
  // falls back to its stored type, which is the only answer available.
  // `expense_lines.type` is still written on insert — it is simply no longer
  // read, and is now a record of what was believed at upload time.
  const linesRes = await db.query(
    `SELECT l.line_id, l.category, l.amount,
            COALESCE(d.type, l.type) AS type,
            l.section
     FROM expense_lines l
     LEFT JOIN expense_category_defaults d
            ON d.user_id = l.user_id AND d.category = l.category
     WHERE l.period_id = $1
     ORDER BY l.section, l.amount DESC`,
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

// ---- SET A CATEGORY'S FIXED/VARIABLE, EVERYWHERE ----
//
// The counterpart to reading the type through the defaults: one write that
// settles a category for every month, past and future. Before this there was
// no way to reclassify after upload at all — the only chance was the upload
// review screen — which is exactly how four months came to disagree with six
// and stayed that way for four months.
//
// Mirrors setCuttability: upsert the default row, inventing the other column
// only when the category has none yet.
export async function setCategoryType(user_id, category, type) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!category || typeof category !== "string")
    throw new ValidationError("category is required");
  if (!isValidType(type))
    throw new ValidationError("type must be fixed or variable");
  await db.query(
    `INSERT INTO expense_category_defaults (user_id, category, type, cuttability)
     VALUES ($1::uuid, $2::varchar, $3::expense_type,
       (SELECT cuttability FROM expense_category_defaults
         WHERE user_id = $1::uuid AND category = $2::varchar))
     ON CONFLICT (user_id, category)
       DO UPDATE SET type = EXCLUDED.type, updated_at = NOW()`,
    [user_id, category, type],
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
