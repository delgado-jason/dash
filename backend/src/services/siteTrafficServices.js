import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";
import { parseWindow } from "../utils/validation/siteTrafficValidation.js";

// A ceiling, not a page size. Every board on /website is computed in the
// browser from the raw hits, so the whole window has to arrive — but a table
// fed by a public beacon is the one table in dash that a stranger can grow, and
// an unbounded SELECT is how one bad night becomes a page that never loads.
// 50,000 views is far past anything this site will see in a year.
const HIT_LIMIT = 50000;

// The window's hits, plus the two day-strings the page does all its arithmetic
// against. The clock is read in the DATABASE, in Central time, for the same
// reason the hits are stamped there: "today" has to mean the same day to the
// beacon writing a row and to the page counting it, whatever timezone the
// browser or the Railway container happens to be in.
export async function getSiteTraffic(user_id, windowKey) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const { key, days } = parseWindow(windowKey);

  // Both bounds come back as TEXT (to_char). A Postgres `date` handed to pg's
  // parser becomes a JS Date at UTC midnight, and every consumer downstream
  // then gets to pick its own day — the #1 recurring bug in this codebase.
  const clock = await db.query(
    `WITH clock AS (SELECT (now() AT TIME ZONE 'America/Chicago')::date AS today)
     SELECT to_char(clock.today, 'YYYY-MM-DD') AS today,
            to_char(clock.today - ($1::int - 1), 'YYYY-MM-DD') AS from
     FROM clock`,
    [days],
  );

  const { today, from } = clock.rows[0];

  // `day` is text for the same reason; `ts` is a timestamptz — an instant, not
  // a date — so its ISO string is exactly right and the page formats it in
  // Central when it shows it.
  const hits = await db.query(
    `SELECT hit_id,
            ts,
            to_char(day, 'YYYY-MM-DD') AS day,
            path,
            ref_host,
            country,
            region,
            visitor,
            device
     FROM site_hits
     WHERE user_id = $1 AND day >= $2::date
     ORDER BY ts DESC
     LIMIT ${HIT_LIMIT}`,
    [user_id, from],
  );

  return { window: key, days, today, from, hits: hits.rows };
}
