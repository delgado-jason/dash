-- 079 · vendor aliases + one-off dismissals (decisions 11A, 12A)
-- (Daily Dollars and Shop Nod Sheet 2026-09-13, Area 4: the vendor bridge)
--
-- The maintenance log's `vendor` is free text, so one shop arrives under two
-- spellings and the rolodex keeps offering the second one forever. Two doors
-- close that gap, and each needs a place to write itself down.
--
-- 12A · MERGE. The vendor keeps the log's spelling as an ALIAS, and the merged
-- rows are rewritten to the vendor's name in the same transaction. The array
-- lives on the vendor rather than in a side table because an alias has no life
-- of its own: it is one more spelling of THIS vendor, it dies with the vendor,
-- and every read that wants it (the spend join, the rolodex) is already
-- selecting the vendor row. Undoing a merge is dropping the array element —
-- the rewritten log rows keep the canonical name.
--
-- 11A · ONE-OFF. A stop he will never visit again is remembered as dismissed,
-- never deleted: the log rows are untouched, the bridge just stops offering the
-- name, and the DISMISSED fold brings it back. `name` holds the log's spelling
-- as typed (trimmed) so the fold can show what he actually saw; `name_key` is
-- the generated match key, and it is the UNIQUE one — "TA " and "ta" are the
-- same one-off, and a second dismissal of the same name re-stamps the first
-- instead of piling up. The key is generated, not written by the app, so the
-- app's key (trim the ends, lowercase, nothing else) can never drift from the
-- one the constraint enforces.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.maintenance_vendor_dismissals (
  dismissal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  name         text NOT NULL,                                   -- the log's spelling, trimmed
  name_key     text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  dismissed_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_vendor_dismissals_one_per_name UNIQUE (user_id, name_key)
);

-- RLS on every public table (CLAUDE.md §5). The backend connects as the
-- postgres owner and bypasses it; this walls the table off from PostgREST.
ALTER TABLE public.maintenance_vendor_dismissals ENABLE ROW LEVEL SECURITY;

-- Every read is "this user's dismissals" — the fold, and the NOT EXISTS the
-- bridge runs on each unfiled name.
CREATE INDEX IF NOT EXISTS idx_maintenance_vendor_dismissals_user
  ON public.maintenance_vendor_dismissals(user_id);
