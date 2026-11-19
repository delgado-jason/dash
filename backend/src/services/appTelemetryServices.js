import { db } from "../../db/pool.js";
import {
  parseAppHit,
  parseAppError,
} from "../utils/validation/appTelemetryValidation.js";

// dash's own use, written by its two beacons and read by the Integrity page's
// "The app itself" part and by the watcher on the DTS server.

// Past this many rows in an hour for one account, further errors are dropped
// (204 all the same) — a render loop must not fill the table.
export const ERROR_FLOOD_PER_HOUR = 200;

export async function recordHit(user, body) {
  const hit = parseAppHit(body);
  await db.query(
    `INSERT INTO app_hits (account_id, user_id, role, page, path)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.account_id, user.self_id, user.role, hit.page, hit.path],
  );
}

// Returns true when the row was kept, false when the flood guard dropped it.
export async function recordError(user, body) {
  const e = parseAppError(body);
  const recent = await db.query(
    `SELECT count(*)::int AS n FROM app_errors
      WHERE account_id = $1 AND at > now() - interval '1 hour'`,
    [user.account_id],
  );
  if ((recent.rows[0]?.n ?? 0) >= ERROR_FLOOD_PER_HOUR) return false;
  await db.query(
    `INSERT INTO app_errors
       (account_id, user_id, role, page, path, kind, message, stack, app_version, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      user.account_id,
      user.self_id,
      user.role,
      e.page,
      e.path,
      e.kind,
      e.message,
      e.stack,
      e.app_version,
      e.user_agent,
    ],
  );
  return true;
}

// Who opened which page, how often, and when last — over the last N days.
export async function hitsSummary(accountId, days) {
  const rows = await db.query(
    `SELECT h.page, h.user_id, u.display_name, u.email, u.role,
            count(*)::int AS views, max(h.at) AS last_at
       FROM app_hits h
       LEFT JOIN users u ON u.user_id = h.user_id
      WHERE h.account_id = $1 AND h.at > now() - make_interval(days => $2)
      GROUP BY h.page, h.user_id, u.display_name, u.email, u.role
      ORDER BY views DESC, h.page`,
    [accountId, days],
  );
  const totals = await db.query(
    `SELECT count(*)::int AS views, count(DISTINCT user_id)::int AS people,
            min(at) AS first_at, max(at) AS last_at
       FROM app_hits
      WHERE account_id = $1 AND at > now() - make_interval(days => $2)`,
    [accountId, days],
  );
  const ever = await db.query(
    `SELECT min(at) AS since, max(at) AS last_ever FROM app_hits WHERE account_id = $1`,
    [accountId],
  );
  const t = totals.rows[0] ?? {};
  return {
    days,
    views: t.views ?? 0,
    people: t.people ?? 0,
    first_at: t.first_at ?? null,
    last_at: t.last_at ?? null,
    since: ever.rows[0]?.since ?? null,
    last_ever: ever.rows[0]?.last_ever ?? null,
    rows: rows.rows,
  };
}

// The errors caught over the last N days, one row per distinct message on a
// page, newest first, with the latest stack.
export async function recentErrors(accountId, days) {
  const rows = await db.query(
    `SELECT message, page, kind, count(*)::int AS count,
            min(at) AS first_at, max(at) AS last_at,
            (array_agg(stack ORDER BY at DESC))[1] AS last_stack,
            (array_agg(user_id ORDER BY at DESC))[1] AS last_user_id,
            (array_agg(app_version ORDER BY at DESC))[1] AS last_version
       FROM app_errors
      WHERE account_id = $1 AND at > now() - make_interval(days => $2)
      GROUP BY message, page, kind
      ORDER BY last_at DESC
      LIMIT 50`,
    [accountId, days],
  );
  const total = await db.query(
    `SELECT count(*)::int AS n FROM app_errors
      WHERE account_id = $1 AND at > now() - make_interval(days => $2)`,
    [accountId, days],
  );
  return { days, total: total.rows[0]?.n ?? 0, rows: rows.rows };
}
