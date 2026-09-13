-- 075 · agencies — the grain the freight bills prove
-- (Agencies Nod Sheet 2026-09-13, nodded: 1A grain · 2A codes on agency/agent/load · 3A rename · 4A backfill)
--
-- A Landstar AGENCY (legal name + agency code) owns several POSTING codes: each
-- agent posts under their own code, and the agency code is the shared desk the
-- owner posts from. `brokers` held posting codes wearing the wrong name, so
-- Central Pennsylvania Logistics was three "brokers" (MAM · CJY · CPL) and
-- Momentum Transportation three more (SUH · JXO · JVL).
--
-- This is the EXPAND step of an expand/contract rename, so the backend that is
-- live while Railway builds the renamed code keeps working:
--   • brokers → agencies (broker_id → agency_id, broker_name → agency_code, + name)
--   • agents / loads gain agency_id (copied from broker_id) and posting_code;
--     broker_id STAYS until 076 drops it
--   • a `brokers` view with the old column names (security_invoker, so RLS
--     still applies through it) — dropped in 076
--   • the backfill: loads.posting_code from the settlement lines; agency names,
--     merges and the agents' posting codes from the 61 freight-bill headers
--     read on 2026-09-13 (posting code · agency name · contact name).
-- The runner executes this file as one implicit transaction: all or nothing.
-- Prod is backed up first (pg_dump -Fc, ~/dash-backups, 2026-09-12 22:35).
-- Dry-run on a restored copy of prod 2026-09-13 (51 rows → 43 agencies, 33 named,
-- 23 agents with their own code, 60 loads with a posting code). Dev ran an earlier
-- copy of this file without the loads.broker_id DROP NOT NULL below; 076 dropped
-- the column there, so dev and prod end identical.

-- ---------------------------------------------------------------- 1. the table
ALTER TABLE public.brokers RENAME TO agencies;
ALTER TABLE public.agencies RENAME COLUMN broker_id TO agency_id;
ALTER TABLE public.agencies RENAME COLUMN broker_name TO agency_code;
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS name varchar(120); -- the legal name from the bill; NULL until known
-- constraint names follow the table only if we rename them; each rename is
-- guarded so a database that never had one (a fresh dev) does not abort the file
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('brokers_pkey', 'agencies_pkey'),
      ('brokers_rating_check', 'agencies_rating_check'),
      ('brokers_user_id_fkey', 'agencies_user_id_fkey'),
      ('unique_broker_per_user', 'unique_agency_code_per_user')
    ) AS v(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.old_name AND conrelid = 'public.agencies'::regclass) THEN
      EXECUTE format('ALTER TABLE public.agencies RENAME CONSTRAINT %I TO %I', r.old_name, r.new_name);
    END IF;
  END LOOP;
END $$;
COMMENT ON TABLE public.agencies IS 'A Landstar agency: legal name + its own 3-letter agency code. Its agents each carry a posting code; the agency code is the shared desk.';
COMMENT ON COLUMN public.agencies.agency_code IS 'the agency''s own code — the one after the dash in "Agency Name: X - CPL" on a freight bill';
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY; -- already on; stated per the house rule

-- ------------------------------------------------ 2. agents and loads: expand
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(agency_id) ON DELETE RESTRICT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS posting_code varchar(3); -- the person''s own code; NULL = posts from the agency desk
ALTER TABLE public.loads  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(agency_id) ON DELETE RESTRICT;
ALTER TABLE public.loads  ADD COLUMN IF NOT EXISTS posting_code varchar(3); -- what the settlement / freight bill posted — evidence, never typed
-- loads.broker_id has been NOT NULL since 017 (agents' was relaxed in 073). The
-- renamed code writes agency_id only, so during the deploy window a load insert
-- would fail on broker_id — relax it now; 076 drops the column.
ALTER TABLE public.loads  ALTER COLUMN broker_id DROP NOT NULL;
UPDATE public.agents SET agency_id = broker_id WHERE agency_id IS NULL AND broker_id IS NOT NULL;
UPDATE public.loads  SET agency_id = broker_id WHERE agency_id IS NULL AND broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_agency ON public.agents(agency_id);
CREATE INDEX IF NOT EXISTS idx_loads_agency  ON public.loads(agency_id);
COMMENT ON COLUMN public.agents.posting_code IS 'the agent''s own posting code (MAM); NULL when they post under the agency code';
COMMENT ON COLUMN public.loads.posting_code IS 'the posting code on the settlement line or freight bill for this load; filled by the settlement feed, never by hand';

-- ---------------------------------- 3. the deploy-window view (dropped in 076)
CREATE VIEW public.brokers WITH (security_invoker = true) AS
  SELECT agency_id AS broker_id, user_id, agency_code AS broker_name, phone, email, rating, notes, created_at, updated_at
  FROM public.agencies;
COMMENT ON VIEW public.brokers IS 'compatibility view for the 075→076 deploy window only';

-- ------------------------- 4. loads.posting_code from the settlement lines
-- one distinct code per load; a load whose lines disagree stays NULL for a person to look at
UPDATE public.loads l
SET posting_code = s.code
FROM (
  SELECT load_id, min(agent_code) AS code
  FROM public.settlement_lines
  WHERE load_id IS NOT NULL AND agent_code IS NOT NULL
  GROUP BY load_id
  HAVING count(DISTINCT agent_code) = 1
) s
WHERE s.load_id = l.load_id AND l.posting_code IS NULL;

-- --------------------------------- 5. the backfill from the freight-bill headers
-- dash's code today → the agency's own code, its legal name, and the posting
-- code of the ONE person filed under that dash code (NULL = the agency desk).
-- (plain temp tables, dropped explicitly at the end — ON COMMIT DROP would vanish
--  between statements under psql's autocommit; the app runner runs one transaction)
CREATE TEMP TABLE bill_map (dash_code text PRIMARY KEY, agency_code text NOT NULL, agency_name text NOT NULL, posting_code text);
INSERT INTO bill_map VALUES
  -- multi-code agencies (the merges)
  ('CPL','CPL','Central Pennsylvania Logistics Inc',NULL),
  ('MAM','CPL','Central Pennsylvania Logistics Inc','MAM'),
  ('CJY','CPL','Central Pennsylvania Logistics Inc','CJY'),
  ('JVL','JVL','Momentum Transportation',NULL),
  ('SUU','JVL','Momentum Transportation','SUH'),       -- Brian Williams posted SUU on his January loads and SUH since July — both Momentum desks; SUH is current
  ('SSU','SST','Interstar Trnsprtn Srvcs Inc','SSU'),
  ('ISM','SST','Interstar Trnsprtn Srvcs Inc','ISM'),
  ('ISE','SST','Interstar Trnsprtn Srvcs Inc','ISE'),  -- inferred from the shared 205-271 phone block; no bill
  ('ALA','ALA','Taylor Shipping Solutions LLC','AUZ'),  -- ALA is the agency code; Saul Cooper posts AUZ
  ('VBR','ALA','Taylor Shipping Solutions LLC','VBR'),
  ('INN','INN','Indy Transport Services','INS'),
  ('INV','INN','Indy Transport Services','INV'),
  ('RPP','ROR','Boss Lady Logistics LLC','RPP'),
  ('RPN','ROR','Boss Lady Logistics LLC','RPN'),
  -- one person, posting under a code that is not the agency code
  ('THX','TLJ','Little John Transportation Svc','TXH'), -- THX was a typo
  ('JKB','JKT','Jack Kellerstrass Agency','JKB'),
  ('AGJ','AGK','Manifest Holdings Group LLC','AGJ'),
  ('NAT','JDU','Pedant Transportation Inc','NAT'),
  ('JUV','DUV','Secrest Direct Inc','JUV'),
  ('BLC','MCS','Massey Chapman Specialized','BLC'),
  ('LYJ','SVC','All About Cargo Inc','LYJ'),
  ('WAU','WAT','Wilcox Enterprises Inc','WAU'),
  ('PZU','POU','Christopher Pough','PZU'),
  ('FWO','FWF','FWF Logistics LLC','FWO'),
  -- agency code = posting code = dash code: names only
  ('LLL','LLL','Long Island Logistics LLC',NULL),
  ('EWT','EWT','Pontiac Enterprises Inc',NULL),
  ('LAN','LAN','L-5 Transportation Inc',NULL),
  ('SRY','SRY','Cor-Zac Transportation LLC',NULL),
  ('DOC','DOC','DOC Brokerage Inc',NULL),
  ('AIP','AIP','Ansell Transport Service',NULL),
  ('WMM','WMM','Pelican Logistics Inc',NULL),
  ('EFM','EFM','Dianna C Miller',NULL),
  ('CMK','CMK','Single Source Transp Of Hartfd',NULL),
  ('LAY','LAY','Triple C Logistics Inc',NULL),
  ('SCF','SCF','Sourcing And Capacity Solutions Inc',NULL),
  ('ABL','ABL','Gary Crites DBA Gary Crites BR',NULL),
  ('PIT','PIT','All States Transportation',NULL),
  ('NRA','NRA','Coshocton Companies LLC',NULL),
  ('JSS','JSS','Shiawassee Solutions LLC',NULL),
  ('ROS','ROS','KJK Logistics Inc',NULL),
  ('JIE','JIE','Julie Floyd',NULL);
-- a person whose own code differs from the code dash filed them under
CREATE TEMP TABLE person_map (first_name text, last_name text, dash_code text, posting_code text);
INSERT INTO person_map VALUES ('Zoe','Norris','JVL','JXO');

DO $$
DECLARE
  m record;
  v_user uuid;
  v_from uuid;      -- the dash row being mapped
  v_survivor uuid;  -- the agency row it belongs to after the merge
  n_named int := 0; n_merged int := 0; n_created int := 0; n_codes int := 0;
BEGIN
  -- 5a. the agents' own posting codes, by the code dash filed them under
  -- (table aliases bm / pm — `m` is the loop record below, and PL/pgSQL would
  --  read `m.posting_code` as the record, not the table)
  UPDATE public.agents ag
  SET posting_code = bm.posting_code
  FROM public.agencies a, bill_map bm
  WHERE ag.agency_id = a.agency_id AND a.agency_code = bm.dash_code AND bm.posting_code IS NOT NULL AND ag.posting_code IS NULL;
  GET DIAGNOSTICS n_codes = ROW_COUNT;
  UPDATE public.agents ag
  SET posting_code = pm.posting_code
  FROM public.agencies a, person_map pm
  WHERE ag.agency_id = a.agency_id AND a.agency_code = pm.dash_code
    AND lower(trim(ag.first_name)) = lower(pm.first_name) AND lower(trim(ag.last_name)) = lower(pm.last_name);

  -- 5b. names, renames and merges — per account, in bill_map order so the
  --     agency's own row (dash_code = agency_code) is settled before a sibling
  --     code has to merge into it.
  FOR m IN
    SELECT * FROM bill_map ORDER BY (dash_code <> agency_code), dash_code
  LOOP
    FOR v_user, v_from IN
      SELECT user_id, agency_id FROM public.agencies WHERE agency_code = m.dash_code
    LOOP
      IF m.dash_code = m.agency_code THEN
        -- the agency's own row: give it its name
        UPDATE public.agencies SET name = coalesce(name, m.agency_name), updated_at = now() WHERE agency_id = v_from;
        n_named := n_named + 1;
      ELSE
        SELECT agency_id INTO v_survivor FROM public.agencies WHERE user_id = v_user AND agency_code = m.agency_code;
        IF v_survivor IS NULL THEN
          -- no row carries the agency's own code yet: this row becomes it
          UPDATE public.agencies SET agency_code = m.agency_code, name = coalesce(name, m.agency_name), updated_at = now() WHERE agency_id = v_from;
          n_created := n_created + 1;
        ELSE
          -- fold this posting-code row into the agency: re-point people and loads, drop the row
          UPDATE public.agents SET agency_id = v_survivor, broker_id = v_survivor, updated_at = now() WHERE agency_id = v_from OR broker_id = v_from;
          UPDATE public.loads  SET agency_id = v_survivor, broker_id = v_survivor, updated_at = now() WHERE agency_id = v_from OR broker_id = v_from;
          UPDATE public.agencies SET name = coalesce(name, m.agency_name), updated_at = now() WHERE agency_id = v_survivor;
          DELETE FROM public.agencies WHERE agency_id = v_from;
          n_merged := n_merged + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- 5c. the one misspelling the bill corrects
  UPDATE public.agents SET first_name = 'Ausra', updated_at = now()
  WHERE lower(trim(first_name)) = 'audra' AND lower(trim(last_name)) = 'jaronis';

  RAISE NOTICE '075 agencies: % named, % renamed to their agency code, % posting-code rows merged, % agents given a posting code',
    n_named, n_created, n_merged, n_codes;
END $$;

DROP TABLE IF EXISTS bill_map, person_map;

-- ------------------------------ 5d. every code an agency has posted under
-- An agency owns a SET of posting codes over time — its own, each agent's, and
-- desks that no longer belong to anyone (Brian Williams posted SUU in January
-- and SUH since July). The set is what the code trail checks a load
-- against; the settlement feed appends to it as new codes appear.
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS posting_codes text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.agencies.posting_codes IS 'every posting code seen for this agency — its own code, its agents'' codes, and any desk the settlements posted under';
UPDATE public.agencies a
SET posting_codes = (
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), '{}')
  FROM (
    SELECT a.agency_code AS c
    UNION SELECT g.posting_code FROM public.agents g WHERE g.agency_id = a.agency_id AND g.posting_code IS NOT NULL
    UNION SELECT l.posting_code FROM public.loads l WHERE l.agency_id = a.agency_id AND l.posting_code IS NOT NULL
  ) s
  WHERE c IS NOT NULL
);

-- ------------------------------------------------------------- 6. the count
DO $$
DECLARE a int; g int; l int; lp int;
BEGIN
  SELECT count(*) INTO a FROM public.agencies;
  SELECT count(*) INTO g FROM public.agents WHERE posting_code IS NOT NULL;
  SELECT count(*) INTO l FROM public.loads WHERE agency_id IS NULL;
  SELECT count(*) INTO lp FROM public.loads WHERE posting_code IS NOT NULL;
  RAISE NOTICE '075 agencies: % agencies · % agents with their own posting code · % loads carry a posting code · % loads without an agency', a, g, lp, l;
END $$;
