-- Security hardening — enable Row-Level Security on the public tables that lacked
-- it, matching the established pattern (RLS ON, no policies). The backend connects
-- as the `postgres` owner role, which BYPASSES RLS, so the app is unaffected; this
-- walls the tables off from Supabase's auto-exposed PostgREST API on the public
-- anon/authenticated keys. (obligations covers its payoff columns — RLS is
-- table-level.)
ALTER TABLE accessorial_pay_rates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_category_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_periods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE per_diem_days             ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trailers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophies                  ENABLE ROW LEVEL SECURITY;

-- Best-effort "never revisit": an event trigger that enables RLS on every future
-- public table automatically. Creating an event trigger needs superuser, which the
-- dev role has but the prod role doesn't — so we create it where allowed and skip
-- it (with a notice) where not. On prod the convention below is the enforcement:
-- every table-creating migration MUST enable RLS explicitly (see CLAUDE.md).
CREATE OR REPLACE FUNCTION public.enable_rls_on_new_table()
RETURNS event_trigger LANGUAGE plpgsql AS $fn$
DECLARE obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE' AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
  END LOOP;
END $fn$;

DO $$
BEGIN
  DROP EVENT TRIGGER IF EXISTS rls_on_create_table;
  CREATE EVENT TRIGGER rls_on_create_table ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.enable_rls_on_new_table();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'rls_on_create_table event trigger skipped (needs superuser); RLS enforced by migration convention instead';
END
$$;
