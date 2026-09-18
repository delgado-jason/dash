-- 081 · site traffic — a beacon on the website, a page in dash
-- (Nod Sheet "The Rest of the Site", Issue 9, nodded 2026-09-17: own it in dash)
--
-- "I need a way to track visitors" on delgadotruckingservices.com. The version
-- that needs no vendor, no event cap and no month-old history quietly vanishing
-- is the one he already owns: one line on the site sends each page view to a
-- small Vercel function, that function hands it to dash's backend
-- (POST /site-hits), which calls `record_site_hit` below, and dash reads the
-- rows on its own /website page. The history is his, forever, in the app he opens every day.
--
-- PRIVACY BY CONSTRUCTION, not by policy. No cookies, so no consent banner.
-- No IP is ever stored: the address arrives as an argument, is folded into a
-- hash, and dies with the call. A "visitor" is a 24-HOUR HASH — sha256 of a
-- per-site secret salt + the Central-time day + the address + the browser —
-- so the same person on the same day counts once, tomorrow they are a new
-- visitor, and no row here can be walked back to a person or joined to another
-- day. That is the whole trick; there is nothing else in this table to leak.
--
-- The salt lives in the database and nowhere else — never in git, never in an
-- env var the site or the Vercel function can read, because the hash is only
-- worth anything if the thing being hashed (a short list of guessable IPs)
-- can't be re-hashed by whoever holds the salt. Rotating it is an UPDATE of
-- site_settings.hit_salt; old rows keep the hashes they were counted under.

-- site_settings: which account a public site belongs to, and its hit salt.
CREATE TABLE IF NOT EXISTS public.site_settings (
  host       text PRIMARY KEY,                       -- 'delgadotruckingservices.com'
  user_id    uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  hit_salt   text NOT NULL,                          -- random per database, never in git
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on every public table (CLAUDE.md §5). The backend connects as the
-- postgres owner and bypasses it; this walls the salt off from PostgREST,
-- which is the one role that can reach the function above it.
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- site_hits: one row per page view. Deliberately flat — no session, no path
-- graph, no funnel. The questions this page answers are "did anyone come",
-- "to which pages", "from where", and there is no reason to keep more than
-- those answers need.
CREATE TABLE IF NOT EXISTS public.site_hits (
  hit_id   bigserial PRIMARY KEY,
  user_id  uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  ts       timestamptz NOT NULL DEFAULT now(),
  day      date NOT NULL,                            -- Central-time day (America/Chicago)
  path     text NOT NULL,
  ref_host text,                                     -- referring site's host, null = direct
  country  text,                                     -- ISO 3166-1 alpha-2
  region   text,                                     -- state code for US (x-vercel-ip-country-region)
  visitor  text NOT NULL,                            -- the 24-hour hash
  device   text NOT NULL DEFAULT 'unknown'           -- desktop | mobile | tablet | unknown
);
ALTER TABLE public.site_hits ENABLE ROW LEVEL SECURITY;

-- The window read (every board on /website) is user + day; the per-visitor
-- rate limit is visitor + ts; the site-wide rate limit is ts.
CREATE INDEX IF NOT EXISTS idx_site_hits_user_day    ON public.site_hits(user_id, day);
CREATE INDEX IF NOT EXISTS idx_site_hits_visitor_ts  ON public.site_hits(visitor, ts);
CREATE INDEX IF NOT EXISTS idx_site_hits_ts          ON public.site_hits(ts);

-- The site belongs to the account OWNER — the earliest admin with no parent,
-- which is the account this database was built around. Idempotent by host, so
-- re-running the migration can never re-salt a live site and orphan every
-- visitor counted so far. Re-pointing the site at a different account, or
-- rotating the salt, is an UPDATE of this row — never a second INSERT.
INSERT INTO public.site_settings (host, user_id, hit_salt)
SELECT
  'delgadotruckingservices.com',
  u.user_id,
  gen_random_uuid()::text || gen_random_uuid()::text
FROM (
  SELECT user_id
  FROM public.users
  WHERE parent_user_id IS NULL AND role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1
) u
ON CONFLICT (host) DO NOTHING;

-- The one door for a page view. SECURITY DEFINER so the salt lookup and the
-- insert run as the owner whoever calls it; the backend is the only caller. Every refusal RETURNs silently
-- — a beacon that learned WHY it was dropped (unknown host, rate limit) would
-- be a probe for the same information.
--
-- pgcrypto's digest() lives in the `extensions` schema on Supabase, so it has
-- to be on the search_path a SECURITY DEFINER function pins.
CREATE OR REPLACE FUNCTION public.record_site_hit(
  p_host text, p_path text, p_ref_host text, p_country text, p_region text,
  p_ip text, p_ua text, p_device text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_host     text := lower(btrim(coalesce(p_host, '')));
  v_settings public.site_settings%ROWTYPE;
  v_path     text;
  v_ref      text;
  v_country  text;
  v_region   text;
  v_device   text;
  v_day      date;
  v_visitor  text;
BEGIN
  -- An unknown host is not this database's site. Nothing is written and
  -- nothing is said.
  SELECT * INTO v_settings FROM public.site_settings WHERE host = v_host;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_path IS NULL THEN
    RETURN;
  END IF;
  -- The query string is noise for a page count and a place for somebody
  -- else's tracking ids to wash up in this table, so it is cut FIRST — a long
  -- ?utm_… tail must not be what costs a real page view its length check.
  v_path := split_part(p_path, '?', 1);
  IF v_path = '' OR left(v_path, 1) <> '/' OR length(v_path) > 200 THEN
    RETURN;
  END IF;

  -- The referrer is kept as a HOST and nothing more: no path, no query — the
  -- question is "which site sent them", not "what were they reading there".
  -- The site's own host is not a referrer; that's internal navigation.
  v_ref := lower(btrim(coalesce(p_ref_host, '')));
  IF v_ref = '' OR v_ref = v_host OR length(v_ref) > 120 THEN
    v_ref := NULL;
  END IF;

  v_country := upper(btrim(coalesce(p_country, '')));
  IF length(v_country) <> 2 THEN
    v_country := NULL;
  END IF;

  -- x-vercel-ip-country-region is a subdivision code: 'TX' in the US, but up
  -- to three characters elsewhere. Anything else is not a region.
  v_region := upper(btrim(coalesce(p_region, '')));
  IF length(v_region) < 1 OR length(v_region) > 3 THEN
    v_region := NULL;
  END IF;

  v_device := lower(btrim(coalesce(p_device, '')));
  IF v_device NOT IN ('desktop', 'mobile', 'tablet') THEN
    v_device := 'unknown';
  END IF;

  -- The day is Central, not UTC: "today" on this page has to mean the day
  -- Jason is living, or every evening's visits would land on tomorrow.
  v_day := (now() AT TIME ZONE 'America/Chicago')::date;

  -- The visitor hash. The salt makes it un-reversible from outside, the day
  -- makes it expire at midnight Central, and the address + browser make it
  -- specific enough to count people instead of page loads.
  v_visitor := encode(
    digest(
      v_settings.hit_salt || v_day::text || coalesce(p_ip, '') || coalesce(p_ua, ''),
      'sha256'
    ),
    'hex'
  );

  -- Two rate limits, both bounded by their own LIMIT so the check costs the
  -- same whether a scraper sent 30 hits or 30,000. One browser gets 30 views
  -- a minute (a real person clicking hard, not a crawler); the whole site gets
  -- 1,000 — past that, something is wrong and the table stops growing.
  IF (SELECT count(*) FROM (
        SELECT 1 FROM public.site_hits
        WHERE visitor = v_visitor AND ts > now() - interval '1 minute'
        LIMIT 30) capped) >= 30 THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM (
        SELECT 1 FROM public.site_hits
        WHERE user_id = v_settings.user_id AND ts > now() - interval '1 minute'
        LIMIT 1000) capped) >= 1000 THEN
    RETURN;
  END IF;

  INSERT INTO public.site_hits (user_id, day, path, ref_host, country, region, visitor, device)
  VALUES (v_settings.user_id, v_day, v_path, v_ref, v_country, v_region, v_visitor, v_device);
END;
$$;

-- PUBLIC gets EXECUTE on a new function by default; take it back. Nothing but
-- the owner runs this: the Data API (PostgREST) is switched off on both of
-- dash's Supabase projects, so the site's beacon reaches the function through
-- dash's backend (POST /site-hits), which connects as the postgres owner.
-- Supabase's default privileges would also hand `anon` and `authenticated`
-- EXECUTE on every new function in public; revoke those explicitly.
REVOKE ALL ON FUNCTION public.record_site_hit(text,text,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_site_hit(text,text,text,text,text,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.record_site_hit(text,text,text,text,text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_site_hit(text,text,text,text,text,text,text,text) TO service_role;
