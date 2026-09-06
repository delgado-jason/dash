import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const SHA_RE = /^[0-9a-f]{64}$/;
const rawPrefix = process.env.DOCS_URL_PREFIX || "https://files.dts-ops.co/";
const DOCS_URL_PREFIX = rawPrefix.endsWith("/") ? rawPrefix : rawPrefix + "/";

const LINE_KINDS = new Set(["trip", "recurring"]);
const LINE_CLASS_RE = /^[a-z][a-z-]{0,23}$/;

function num(v, name, { optional = false } = {}) {
  if (v === undefined || v === null || v === "") {
    if (optional) return null;
    throw new ValidationError(`bad ${name}`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError(`bad ${name}`);
  return n;
}

// The DTS server feeds one parsed, self-reconciled Contractor Statement.
// A week the archive already has is refused (inserted: false) — never
// overwritten. Lines land transactionally with their settlement; per-line
// load numbers resolve to load_ids where the load exists in dash.
export async function ingestSettlement(user_id, body) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const b = body ?? {};
  if (typeof b.period_ending !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.period_ending))
    throw new ValidationError("period_ending must be YYYY-MM-DD");
  if (!b.sha256 || !SHA_RE.test(b.sha256)) throw new ValidationError("bad sha256");
  if (!b.server_url || !b.server_url.startsWith(DOCS_URL_PREFIX) ||
      b.server_url.includes("/../") || b.server_url.length > 1000)
    throw new ValidationError("server_url must be on the DTS file host");
  if (!Array.isArray(b.lines) || b.lines.length === 0 || b.lines.length > 500)
    throw new ValidationError("lines must be 1..500");

  const totals = {
    revenue: num(b.revenue, "revenue"),
    refunds: num(b.refunds, "refunds"),
    deductions: num(b.deductions, "deductions"),
    net: num(b.net, "net"),
  };
  // the identity every reconciled statement satisfies (proven across all 39
  // vault statements) — defense in depth against a parser regression
  if (Math.abs(totals.revenue + totals.refunds - totals.deductions - totals.net) > 0.01)
    throw new ValidationError("totals do not satisfy revenue + refunds - deductions = net");
  const escrow_tractor = num(b.escrow_tractor, "escrow_tractor", { optional: true });
  const escrow_trailer = num(b.escrow_trailer, "escrow_trailer", { optional: true });
  const ytd_earnings = num(b.ytd_earnings, "ytd_earnings", { optional: true });

  const lines = b.lines.map((l, i) => {
    if (!LINE_KINDS.has(l.kind)) throw new ValidationError(`line ${i}: bad kind`);
    if (!l.line_class || !LINE_CLASS_RE.test(l.line_class))
      throw new ValidationError(`line ${i}: bad line_class`);
    if (!l.description || typeof l.description !== "string")
      throw new ValidationError(`line ${i}: bad description`);
    if (l.load_number != null && (typeof l.load_number !== "string" || l.load_number.length > 20))
      throw new ValidationError(`line ${i}: bad load_number`);
    return {
      load_number: l.load_number ?? null,
      agent_code: l.agent_code ? String(l.agent_code).slice(0, 3) : null,
      kind: l.kind,
      line_class: l.line_class,
      is_adjustment: Boolean(l.is_adjustment),
      description: l.description.slice(0, 200),
      revenue: num(l.revenue, `line ${i} revenue`, { optional: true }),
      refunds: num(l.refunds, `line ${i} refunds`, { optional: true }),
      deductions: num(l.deductions, `line ${i} deductions`, { optional: true }),
      net: num(l.net, `line ${i} net`, { optional: true }),
      line_date: l.line_date ? String(l.line_date).slice(0, 10) : null,
      unit: l.unit ? String(l.unit).slice(0, 10) : null,
    };
  });

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const head = await client.query(
      `INSERT INTO settlements (user_id, period_ending, revenue, refunds, deductions,
                                net, escrow_tractor, escrow_trailer, ytd_earnings,
                                sha256, server_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id, period_ending) DO NOTHING
       RETURNING settlement_id`,
      [user_id, b.period_ending, totals.revenue, totals.refunds, totals.deductions,
       totals.net, escrow_tractor, escrow_trailer, ytd_earnings, b.sha256, b.server_url],
    );
    if (head.rowCount === 0) {
      // Week already archived — never overwritten. But a load entered AFTER
      // its week was fed can now claim its lines: heal, then report.
      const healed = await client.query(
        `UPDATE settlement_lines sl SET load_id = l.load_id
         FROM loads l
         WHERE sl.user_id = $1 AND sl.load_id IS NULL AND sl.load_number IS NOT NULL
           AND l.user_id = $1 AND l.load_number = sl.load_number`,
        [user_id],
      );
      await client.query("COMMIT");
      return { inserted: false, relinked: healed.rowCount };
    }
    const settlement_id = head.rows[0].settlement_id;

    // one round-trip load_number -> load_id map for this user
    const numbers = [...new Set(lines.map((l) => l.load_number).filter(Boolean))];
    const loadMap = new Map();
    if (numbers.length) {
      const found = await client.query(
        `SELECT load_id, load_number FROM loads WHERE user_id = $1 AND load_number = ANY($2)`,
        [user_id, numbers],
      );
      for (const r of found.rows) loadMap.set(r.load_number, r.load_id);
    }

    for (const l of lines) {
      await client.query(
        `INSERT INTO settlement_lines
           (user_id, settlement_id, load_id, load_number, agent_code, kind, line_class,
            is_adjustment, description, revenue, refunds, deductions, net, line_date, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [user_id, settlement_id, l.load_number ? loadMap.get(l.load_number) ?? null : null,
         l.load_number, l.agent_code, l.kind, l.line_class, l.is_adjustment,
         l.description, l.revenue, l.refunds, l.deductions, l.net, l.line_date, l.unit],
      );
    }
    // every feed also heals older weeks' unlinked lines — this is what makes
    // the Guide's "enter the load and the next feed links it" TRUE
    await client.query(
      `UPDATE settlement_lines sl SET load_id = l.load_id
       FROM loads l
       WHERE sl.user_id = $1 AND sl.load_id IS NULL AND sl.load_number IS NOT NULL
         AND l.user_id = $1 AND l.load_number = sl.load_number`,
      [user_id],
    );
    await client.query("COMMIT");
    return { inserted: true, settlement_id, unmatched_loads: numbers.filter((n) => !loadMap.has(n)) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// The weekly board: settlements newest-first with the aggregates the page
// needs (advances split out so deduction buckets exclude them, adjustment
// lines listed, unmatched-load flags).
export async function getSettlements(user_id, limit = 26) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const heads = await db.query(
    `SELECT settlement_id, to_char(period_ending,'YYYY-MM-DD') AS period_ending,
            revenue, refunds, deductions, net, escrow_tractor, escrow_trailer,
            ytd_earnings, server_url
     FROM settlements WHERE user_id = $1
     ORDER BY period_ending DESC LIMIT $2`,
    [user_id, Math.min(Math.max(Math.trunc(Number(limit)) || 26, 1), 120)],
  );
  if (heads.rowCount === 0) return [];
  const ids = heads.rows.map((r) => r.settlement_id);
  const aggs = await db.query(
    `SELECT settlement_id,
            COUNT(DISTINCT load_number) FILTER (WHERE kind = 'trip' AND revenue IS NOT NULL AND NOT is_adjustment) AS loads,
            COALESCE(SUM(deductions) FILTER (WHERE line_class = 'advance'), 0) AS advances
     FROM settlement_lines WHERE settlement_id = ANY($1)
     GROUP BY settlement_id`,
    [ids],
  );
  // cumulative per-load effect within the week: a reversal+rebill pair
  // shows its NET (+$2.22), never the scary half alone
  const adjRows = await db.query(
    `WITH adj_loads AS (
       SELECT DISTINCT settlement_id, load_number
       FROM settlement_lines
       WHERE settlement_id = ANY($1) AND is_adjustment AND load_number IS NOT NULL
     )
     SELECT sl.settlement_id, sl.load_number,
            MAX(sl.agent_code) AS agent_code,
            MAX(sl.load_id::text) AS load_id,
            SUM(COALESCE(sl.revenue, 0)) - SUM(COALESCE(sl.deductions, 0)) AS amount,
            STRING_AGG(DISTINCT sl.description, ' + ')
              FILTER (WHERE sl.is_adjustment) AS description
     FROM settlement_lines sl
     JOIN adj_loads a
       ON a.settlement_id = sl.settlement_id AND a.load_number = sl.load_number
     GROUP BY sl.settlement_id, sl.load_number
     ORDER BY sl.load_number`,
    [ids],
  );
  const unmatched = await db.query(
    `SELECT DISTINCT settlement_id, load_number
     FROM settlement_lines
     WHERE settlement_id = ANY($1) AND load_number IS NOT NULL AND load_id IS NULL`,
    [ids],
  );
  const aggMap = new Map(aggs.rows.map((r) => [r.settlement_id, r]));
  const adjMap = new Map();
  for (const a of adjRows.rows) {
    if (!adjMap.has(a.settlement_id)) adjMap.set(a.settlement_id, []);
    adjMap.get(a.settlement_id).push(a);
  }
  const unmatchedMap = new Map();
  for (const u of unmatched.rows) {
    if (!unmatchedMap.has(u.settlement_id)) unmatchedMap.set(u.settlement_id, []);
    unmatchedMap.get(u.settlement_id).push(u.load_number);
  }
  return heads.rows.map((h) => ({
    ...h,
    loads: Number(aggMap.get(h.settlement_id)?.loads ?? 0),
    advances: aggMap.get(h.settlement_id)?.advances ?? "0",
    adjustments: adjMap.get(h.settlement_id) ?? [],
    unmatched_loads: unmatchedMap.get(h.settlement_id) ?? [],
  }));
}

// A load's cumulative settlement history across every statement ever fed.
export async function getLoadSettlement(user_id, load_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!load_id) throw new ValidationError("Missing load_id");
  const result = await db.query(
    `SELECT sl.line_id, sl.kind, sl.line_class, sl.is_adjustment, sl.description,
            sl.revenue, sl.refunds, sl.deductions, sl.net, sl.unit,
            to_char(s.period_ending,'YYYY-MM-DD') AS period_ending, s.server_url
     FROM settlement_lines sl
     JOIN settlements s ON s.settlement_id = sl.settlement_id
     WHERE sl.user_id = $1 AND sl.load_id = $2
     ORDER BY s.period_ending, sl.line_id`,
    [user_id, load_id],
  );
  return result.rows;
}

// Per-load settlement rollup for the LOADS TABLE flags and the detail page's
// open-last-statement link: settled gross (all lines, reversals included),
// the last statement that touched the load, adjustment presence.
export async function getSettlementsByLoad(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");
  const result = await db.query(
    `SELECT sl.load_id,
            SUM(COALESCE(sl.revenue, 0)) AS gross_settled,
            to_char(MAX(s.period_ending), 'YYYY-MM-DD') AS last_period_ending,
            (ARRAY_AGG(s.server_url ORDER BY s.period_ending DESC))[1] AS last_server_url,
            BOOL_OR(sl.is_adjustment) AS has_adjustments
     FROM settlement_lines sl
     JOIN settlements s ON s.settlement_id = sl.settlement_id
     WHERE sl.user_id = $1 AND sl.load_id IS NOT NULL
     GROUP BY sl.load_id`,
    [user_id],
  );
  return result.rows;
}
