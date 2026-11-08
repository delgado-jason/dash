-- The nightly backup's read-only login (Nod Sheet "Nightly Backups", call 2
-- lean A, nodded 2026-11-08: "We go with all of your recommendations for the
-- nightly backups").
--
-- dash's database is dumped every night by the DTS server (dts-srv) as a role
-- that can read everything and change nothing: LOGIN so pg_dump can connect;
-- pg_read_all_data for SELECT on every table and sequence in every schema,
-- including tables later migrations add, so a new table can never break the
-- dump; BYPASSRLS because 57 of the 60 public tables carry row-level security
-- with no policies (the app connects as the owner, which bypasses it) — without
-- the attribute a non-owner reads zero rows and pg_dump refuses the table.
-- Supabase's `postgres` owner may create such a role (probed 2026-11-08 in a
-- rolled-back transaction); the platform's own supabase_read_only_user is a
-- reserved role whose password only a superuser can set, so it is not used.
--
-- NO PASSWORD HERE. It is set by hand after this runs, once per database, and
-- lives only in /etc/dts/dash-db.env on dts-srv (root, 0600):
--     ALTER ROLE dash_backup PASSWORD '<generated>';
-- Rotate by re-running that line and rewriting the file. Idempotent: safe to
-- re-run, and it never touches a password that is already set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_backup') THEN
    CREATE ROLE dash_backup LOGIN BYPASSRLS NOCREATEDB NOCREATEROLE CONNECTION LIMIT 3;
  END IF;
END
$$;

GRANT pg_read_all_data TO dash_backup;

COMMENT ON ROLE dash_backup IS
  'nightly pg_dump from dts-srv: reads everything, writes nothing (migration 103, 2026-11-08)';
