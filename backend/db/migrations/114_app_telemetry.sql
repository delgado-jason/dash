-- 114: dash sees itself — two flat tables the app writes about its own use.
--
-- app_hits: one row per page opened by a signed-in person (the route-change
-- beacon). `page` is the route family (/loads/· for every load page), `path`
-- the exact one. Read by the Integrity page's "The app itself" part and by the
-- watcher on the DTS server ("nobody has opened dash in three days").
--
-- app_errors: one row per error the browser caught — a thrown error, an
-- unhandled promise, a render crash the error boundary stopped. Grouped on the
-- Integrity page; the watcher reads yesterday's. The service drops rows past
-- 200 an hour per account so a loop can't fill the table.
--
-- Additive: applied on dev and prod before the merge (dump first). RLS on, as
-- every public table (the API connects as the owner role and bypasses it).

CREATE TABLE IF NOT EXISTS public.app_hits (
  id          bigserial PRIMARY KEY,
  account_id  uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  role        text        NOT NULL,
  page        text        NOT NULL,
  path        text        NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_hits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_app_hits_account_at ON public.app_hits(account_id, at);

CREATE TABLE IF NOT EXISTS public.app_errors (
  id          bigserial PRIMARY KEY,
  account_id  uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  role        text        NOT NULL,
  page        text        NOT NULL,
  path        text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('error', 'rejection', 'render')),
  message     text        NOT NULL,
  stack       text,
  app_version text,
  user_agent  text,
  at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_app_errors_account_at ON public.app_errors(account_id, at);

COMMENT ON TABLE public.app_hits IS 'dash''s own page views — who opened which page, when (the route-change beacon)';
COMMENT ON TABLE public.app_errors IS 'errors the browser caught in dash — thrown, unhandled promise, or a render crash';
