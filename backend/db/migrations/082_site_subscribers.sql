-- 082 · site subscribers — the Logbook's list, owned here first
-- (Nod Sheet "The Logbook", Issues 6 and 8, nodded 2026-09-18: "we go with all
--  of your leans" — the form → dash → Kit, and dash keeps the copy)
--
-- The website is getting a driver-facing series, The Logbook, with an email
-- signup on every entry. An email list is other people's personal data plus a
-- standing legal duty to let them leave, so the sending — the confirmation
-- email, the entries, the physical address in every footer, the unsubscribe
-- link — belongs to a service whose job that is. That service is Kit (free to
-- 10,000 subscribers). What does NOT belong to Kit is the list itself.
--
-- So the address lands HERE first and goes to Kit second: the site's form
-- posts to a small Vercel function, which hands it to dash's backend
-- (POST /site-subscribers — the same public door the visitor beacon uses),
-- which writes the row below and only then calls Kit with a key that lives on
-- Railway with dash's other secrets. If Kit's free tier ever changes under
-- him, every address he ever collected is already in a table he owns. And
-- because the write comes first, the Kit call is allowed to fail: the row
-- waits as `pending` and the next sync picks it up. That is also how this
-- ships BEFORE the Kit account exists — no key on Railway means every row
-- simply waits, and POST /site-subscribers/sync pushes them when it does.
--
-- WHAT A ROW KEEPS, and nothing more: the address, when it arrived, the entry
-- it was signed up from, and which version of the consent line that person was
-- shown — that last one is the only honest answer to "what did they agree to",
-- months later, after the copy has been edited. WHAT IT NEVER KEEPS: the IP or
-- the browser. site_hits goes to real trouble not to store those (migration
-- 081); a mailing list has no use for them at all.

CREATE TABLE IF NOT EXISTS public.site_subscribers (
  subscriber_id     bigserial PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  email             text NOT NULL,                                  -- as typed, trimmed
  -- The address he mails is the one they typed; the address that decides
  -- "is this person already on the list" is this one. Folding the case in a
  -- GENERATED column rather than in the backend means the uniqueness below is
  -- the DATABASE's rule — no future caller can sign Jay@ up a second time by
  -- forgetting to lowercase first.
  email_key         text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  source_path       text,                                           -- the page the form was on
  consent_version   text NOT NULL,                                  -- which consent line they saw
  kit_subscriber_id text,
  kit_status        text NOT NULL DEFAULT 'pending'
                    CHECK (kit_status IN ('pending','sent','confirmed','unsubscribed','failed')),
  kit_synced_at     timestamptz,
  kit_error         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One row per address per account. A returning reader re-submitting the form
  -- is an UPDATE, never a second row — the upsert in the service decides what
  -- that means (a confirmed subscriber stays confirmed; one who left and came
  -- back goes to 'pending' so Kit is asked again).
  CONSTRAINT site_subscribers_one_per_address UNIQUE (user_id, email_key)
);

-- RLS on every public table (CLAUDE.md §5). No policies, like site_hits: the
-- backend connects as the postgres owner and bypasses RLS, and this is a table
-- of other people's email addresses — the one thing that must never be one
-- misconfigured anon key away from the outside.
ALTER TABLE public.site_subscribers ENABLE ROW LEVEL SECURITY;

-- The page read is user + newest first; the sync is "which of mine are still
-- waiting", which is a partial index because 'pending' is the small, shrinking
-- end of a table that only grows.
CREATE INDEX IF NOT EXISTS idx_site_subscribers_user_created ON public.site_subscribers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_subscribers_pending ON public.site_subscribers(user_id) WHERE kit_status = 'pending';

-- No seed. The account that owns the site is already on file in site_settings
-- (migration 081), found by host, and there is exactly one host — adding a
-- second source of that truth is how the two drift apart.
