-- 076 · agencies — CONTRACT step (apply only after the renamed backend is live on Railway)
-- 075 expanded: renamed brokers → agencies, added agency_id / posting_code, kept
-- broker_id and a `brokers` view so the old code kept working through the
-- deploy. Now the old names go.
--
-- Rows the OLD code created during the window carry broker_id and no agency_id
-- — heal those. A row where BOTH are set but disagree is ambiguous (the new code
-- may have reassigned an agent and, correctly, never touched broker_id), so it
-- is counted and reported, never overwritten.
DO $$
DECLARE healed_a int; healed_l int; dis_a int; dis_l int;
BEGIN
  UPDATE public.agents SET agency_id = broker_id WHERE agency_id IS NULL AND broker_id IS NOT NULL;
  GET DIAGNOSTICS healed_a = ROW_COUNT;
  UPDATE public.loads  SET agency_id = broker_id WHERE agency_id IS NULL AND broker_id IS NOT NULL;
  GET DIAGNOSTICS healed_l = ROW_COUNT;
  SELECT count(*) INTO dis_a FROM public.agents WHERE broker_id IS NOT NULL AND agency_id IS NOT NULL AND agency_id <> broker_id;
  SELECT count(*) INTO dis_l FROM public.loads  WHERE broker_id IS NOT NULL AND agency_id IS NOT NULL AND agency_id <> broker_id;
  RAISE NOTICE '076 agencies contract: healed % agents and % loads written by the old code; % agents and % loads disagree between broker_id and agency_id (agency_id kept — look if not zero)',
    healed_a, healed_l, dis_a, dis_l;
END $$;

DROP VIEW IF EXISTS public.brokers;
ALTER TABLE public.agents DROP COLUMN IF EXISTS broker_id; -- drops agents_broker_id_fkey with it
ALTER TABLE public.loads  DROP COLUMN IF EXISTS broker_id; -- drops loads_broker_id_fkey with it

DO $$
DECLARE a int; g int; l int;
BEGIN
  SELECT count(*) INTO a FROM public.agencies;
  SELECT count(*) INTO g FROM public.agents WHERE agency_id IS NULL;
  SELECT count(*) INTO l FROM public.loads  WHERE agency_id IS NULL;
  RAISE NOTICE '076 agencies contract: % agencies · % agents without an agency · % loads without an agency', a, g, l;
END $$;
