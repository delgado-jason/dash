import { db } from "../../db/pool.js";
import { ValidationError } from "../utils/error.js";
import { parseSiteSubscriber } from "../utils/validation/siteSubscriberValidation.js";
import { parseWindow } from "../utils/validation/siteTrafficValidation.js";
import { kitStateToStatus, kitCreatePayload, isDoubleOptIn } from "../utils/kitState.js";

// Kit's v4 API — the two calls a sync makes, in this order. Creating the
// subscriber and adding it to the form are separate endpoints: the first gives
// the address an id in the account, the second is what actually subscribes it
// to the Logbook form and triggers Kit's confirmation email. The key travels
// as a header, never in the URL, so it can't end up in a log line.
//   https://developers.kit.com/api-reference/subscribers/create-a-subscriber
//   https://developers.kit.com/api-reference/forms/add-subscriber-to-form
const KIT = {
  base: "https://api.kit.com/v4",
  header: "X-Kit-Api-Key",
  subscribers: () => `${KIT.base}/subscribers`,
  subscriber: (subscriberId) => `${KIT.base}/subscribers/${encodeURIComponent(subscriberId)}`,
  formSubscribers: (formId, subscriberId) =>
    `${KIT.base}/forms/${encodeURIComponent(formId)}/subscribers/${encodeURIComponent(subscriberId)}`,
};

// How many waiting rows one sync pushes. A signup's own sync only ever has one
// row to move; this ceiling is for the first sync after the key finally lands
// on Railway, and it keeps that one from holding a request open for minutes.
// Whatever it doesn't reach is still pending, and the next call takes the next
// fifty.
const SYNC_BATCH = 50;

// How many of Kit's own rows one sync asks about. A refresh is a GET per row,
// so it takes the rows Kit was asked about longest ago first, and whatever it
// doesn't reach this time is first in line next time.
const REFRESH_BATCH = 100;

// The site-wide rate limit, per minute. site_hits allows 1,000 a minute
// because a real visit is cheap; a signup is not — 60 in a minute from one
// site is a script filling the form, and the table it is filling holds other
// people's email addresses.
const SIGNUP_LIMIT_PER_MINUTE = 60;

// How much of a failed Kit response is worth keeping. Enough to recognise the
// problem on the Website page; not enough to turn kit_error into a log file.
const KIT_ERROR_MAX = 200;

// The newest signups the page shows.
const LATEST_LIMIT = 25;

// ---- WRITE (public) ----
// One signup, from the website's form by way of /api/subscribe on Vercel.
// Every refusal after the body parses is SILENT and the route answers 204
// either way: a door that told a stranger "that host isn't ours" or "you have
// hit the limit" would be answering questions nobody should get to ask. Only a
// malformed body is worth a 400, because only the site sends those and only
// the site can fix them.
export async function recordSiteSubscriber(body) {
  const sub = parseSiteSubscriber(body);

  // An unknown host is not this database's site (site_settings, migration 081).
  const settings = await db.query(
    "SELECT user_id FROM site_settings WHERE host = lower(btrim($1))",
    [sub.host],
  );
  if (settings.rowCount === 0) return;

  const user_id = settings.rows[0].user_id;

  // Bounded by its own LIMIT so the check costs the same whether a script sent
  // 60 signups this minute or 60,000.
  const recent = await db.query(
    `SELECT count(*)::int AS n
     FROM (SELECT 1 FROM site_subscribers
           WHERE user_id = $1 AND created_at > now() - interval '1 minute'
           LIMIT $2) capped`,
    [user_id, SIGNUP_LIMIT_PER_MINUTE],
  );
  if (recent.rows[0].n >= SIGNUP_LIMIT_PER_MINUTE) return;

  // A returning reader is welcomed back, not duplicated. The uniqueness is the
  // database's (user_id + the lowercased email_key, migration 082), so the
  // only question here is what a second submission MEANS: someone who already
  // confirmed stays confirmed and is not re-mailed; someone who unsubscribed
  // and came back is asking to return, so they go to 'pending' and the next
  // sync hands them to Kit again. 'sent' and 'failed' hold their state too —
  // a failed row is the sync's to retry, not the form's.
  await db.query(
    `INSERT INTO site_subscribers (user_id, email, source_path, consent_version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, email_key) DO UPDATE
       SET updated_at      = now(),
           source_path     = EXCLUDED.source_path,
           consent_version = EXCLUDED.consent_version,
           kit_status      = CASE
                               WHEN site_subscribers.kit_status = 'unsubscribed'
                               THEN 'pending'
                               ELSE site_subscribers.kit_status
                             END`,
    [user_id, sub.email, sub.source_path, sub.consent_version],
  );

  // The row is safe; Kit is the part that can be down, rate-limited, or not
  // configured at all. None of that is the reader's problem — they typed their
  // address into a form and it was kept. The row stays pending and the next
  // sync picks it up.
  try {
    await syncPendingToKit(user_id);
  } catch {
    /* the signup is on file; the sync is retryable by definition */
  }
}

// ---- THE KIT SYNC ----
// Pushes waiting rows to Kit, oldest first. Runs after every signup and on
// demand (POST /site-subscribers/sync) — which is the door for the day the key
// finally lands on Railway and a launch week of pending rows needs to move.
//
// No key configured is not an error: this feature ships BEFORE the Kit account
// exists, by design, and until it does every signup simply waits.
export async function syncPendingToKit(user_id) {
  if (!user_id) throw new ValidationError("Missing user_id");

  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;
  if (!apiKey || !formId) {
    return { skipped: true, reason: "kit not configured" };
  }

  const pending = await db.query(
    `SELECT subscriber_id, email
     FROM site_subscribers
     WHERE user_id = $1 AND kit_status = 'pending'
     ORDER BY created_at ASC
     LIMIT $2`,
    [user_id, SYNC_BATCH],
  );

  let sent = 0;
  let failed = 0;

  for (const row of pending.rows) {
    try {
      const created = await kitPost(
        apiKey,
        KIT.subscribers(),
        kitCreatePayload(row.email, isDoubleOptIn()),
      );
      if (!created.ok) {
        await markFailed(row.subscriber_id, created.error);
        failed += 1;
        continue;
      }

      // Kit answers with { subscriber: { id, … } }. Without that id there is
      // nothing to add to the form, so treat a shape we don't recognise as a
      // failure rather than writing a null id and calling it sent.
      const kitId = created.body?.subscriber?.id;
      if (kitId == null) {
        await markFailed(row.subscriber_id, "no subscriber id in Kit's response");
        failed += 1;
        continue;
      }

      const added = await kitPost(apiKey, KIT.formSubscribers(formId, kitId), {});
      if (!added.ok) {
        await markFailed(row.subscriber_id, added.error);
        failed += 1;
        continue;
      }

      // 'sent', not 'confirmed'. With KIT_DOUBLE_OPT_IN the address waits in
      // Kit as inactive until the reader clicks the confirmation email, and the
      // next sync's refresh writes 'confirmed' when Kit reports active. Without
      // the switch Kit makes it active at once, so the very next refresh
      // confirms it — the reader was never asked.
      await db.query(
        `UPDATE site_subscribers
         SET kit_status = 'sent', kit_subscriber_id = $2, kit_synced_at = now(),
             kit_error = NULL, updated_at = now()
         WHERE subscriber_id = $1`,
        [row.subscriber_id, String(kitId)],
      );
      sent += 1;
    } catch (err) {
      // A thrown fetch is the network, not Kit: DNS, a dropped connection, a
      // timeout. Same treatment — the row is marked and the batch carries on,
      // because one unreachable address must not strand the forty-nine behind it.
      await markFailed(row.subscriber_id, err.message);
      failed += 1;
    }
  }

  // Then ask Kit how the rows it already holds are doing — who clicked the
  // confirmation link, who left. Same key, same call; a refresh that fails
  // leaves every row exactly as it was.
  let refreshed = { checked: 0, confirmed: 0, unsubscribed: 0 };
  try {
    refreshed = await refreshKitStatuses(user_id, apiKey);
  } catch {
    /* the push above already happened; the statuses catch up next time */
  }

  return { skipped: false, sent, failed, ...refreshed };
}

// ---- THE STATUS REFRESH ----
// dash writes 'sent' when Kit takes an address; only Kit knows what happened
// next. This reads Kit's `state` for the rows dash handed over and translates
// it (utils/kitState.js): active → confirmed, cancelled/bounced/complained →
// unsubscribed, anything else → unchanged. A row is never marked 'failed' by a
// refresh — a GET that fails today is asked again tomorrow.
export async function refreshKitStatuses(user_id, apiKey = process.env.KIT_API_KEY) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!apiKey) return { checked: 0, confirmed: 0, unsubscribed: 0 };

  const held = await db.query(
    `SELECT subscriber_id, kit_subscriber_id, kit_status
     FROM site_subscribers
     WHERE user_id = $1
       AND kit_subscriber_id IS NOT NULL
       AND kit_status IN ('sent', 'confirmed')
     ORDER BY kit_synced_at ASC NULLS FIRST
     LIMIT $2`,
    [user_id, REFRESH_BATCH],
  );

  let checked = 0;
  let confirmed = 0;
  let unsubscribed = 0;

  for (const row of held.rows) {
    let body;
    try {
      const res = await fetch(KIT.subscriber(row.kit_subscriber_id), {
        headers: { [KIT.header]: apiKey, Accept: "application/json" },
      });
      if (res.status !== 200) continue;
      body = await res.json().catch(() => null);
    } catch {
      continue; // the network, not the reader — ask again next time
    }

    checked += 1;
    const status = kitStateToStatus(body?.subscriber?.state);
    if (!status || status === row.kit_status) {
      // Nothing new — but the row was asked about, and the queue order above
      // rides on kit_synced_at, so stamp it.
      await db.query(
        `UPDATE site_subscribers SET kit_synced_at = now() WHERE subscriber_id = $1`,
        [row.subscriber_id],
      );
      continue;
    }

    await db.query(
      `UPDATE site_subscribers
       SET kit_status = $2, kit_synced_at = now(), updated_at = now()
       WHERE subscriber_id = $1`,
      [row.subscriber_id, status],
    );
    if (status === "confirmed") confirmed += 1;
    if (status === "unsubscribed") unsubscribed += 1;
  }

  return { checked, confirmed, unsubscribed };
}

// One call to Kit, reduced to "did it work, and if not, what do we write down".
// Kit answers 201 for a created subscriber and 200 for one that already
// existed, so both count — a reader who signed up on another form is already
// in the account and still needs adding to this one.
async function kitPost(apiKey, url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      [KIT.header]: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status !== 200 && res.status !== 201) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `${res.status} ${text.slice(0, KIT_ERROR_MAX)}`.trim(),
    };
  }

  const body = await res.json().catch(() => null);
  return { ok: true, body };
}

async function markFailed(subscriber_id, error) {
  await db.query(
    `UPDATE site_subscribers
     SET kit_status = 'failed', kit_error = $2, kit_synced_at = now(),
         updated_at = now()
     WHERE subscriber_id = $1`,
    [subscriber_id, String(error ?? "").slice(0, KIT_ERROR_MAX)],
  );
}

// ---- READ (the Website page) ----
// The window's signups, plus the running total, plus the newest 25. The clock
// is read in the DATABASE in Central time for the same reason getSiteTraffic
// reads it there: "today" has to mean the same day to the row being written
// and to the figure counting it, whatever timezone Railway's container thinks
// it is in.
export async function getSiteSubscribers(user_id, windowKey) {
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

  // `total` is the whole list and ignores the window — it is the answer to
  // "how many people are on this", which no window should be able to shrink.
  // The window count compares on the CENTRAL day, like every other figure on
  // the page: a signup at 8pm Central on the window's first day belongs to
  // that day, not to the UTC tomorrow its timestamp falls in.
  const counts = await db.query(
    `SELECT count(*)::int AS total,
            (count(*) FILTER (
              WHERE (created_at AT TIME ZONE 'America/Chicago')::date >= $2::date
            ))::int AS window_count
     FROM site_subscribers
     WHERE user_id = $1`,
    [user_id, from],
  );

  // `ts` is a timestamptz — an instant, not a date — so its ISO string is
  // exactly right and the page formats it in Central when it shows it. `day`
  // is the Central calendar day that instant fell on, as text.
  const latest = await db.query(
    `SELECT subscriber_id,
            email,
            created_at AS ts,
            to_char((created_at AT TIME ZONE 'America/Chicago')::date, 'YYYY-MM-DD') AS day,
            source_path,
            kit_status
     FROM site_subscribers
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [user_id, LATEST_LIMIT],
  );

  return {
    window: key,
    days,
    today,
    from,
    total: counts.rows[0].total,
    window_count: counts.rows[0].window_count,
    latest: latest.rows,
  };
}
