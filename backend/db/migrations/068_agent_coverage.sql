-- 068_agent_coverage.sql
-- The agent coverage sweep (Jason, 2026-09-10; approved mockup).
--
-- An agent on a qualification call names MARKETS, not customers: "I've got
-- shippers in Savannah and Charleston." So coverage is (city, state) with the
-- shipper name NULLABLE — it fills in later, if ever.
--
-- Coverage is CLAIMED INTEL and is kept strictly apart from `facilities`, which
-- stays a factual record of where the truck has physically been. Same shape,
-- different epistemic status; merging them would corrupt ground truth with
-- hearsay. `source` carries the distinction: 'stated' (they said so) flips to
-- 'confirmed' (we hauled it) when a load lands from that city, so a claim is a
-- hypothesis the loads eventually TEST.
--
-- Idempotent throughout.

-- ---------------------------------------------------------------------------
-- 1. Coverage — what an agent says they cover
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_coverage (
  coverage_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  agent_id          uuid NOT NULL REFERENCES public.agents(agent_id) ON DELETE CASCADE,
  -- City/state arrive CANONICAL from the existing CityAutocomplete (HERE-backed),
  -- so they always key cleanly against city_coords for the Foreman's distances.
  city              varchar(100) NOT NULL,
  state             varchar(2) NOT NULL,
  shipper_name      varchar(120),          -- NULL is the normal case
  source            text NOT NULL DEFAULT 'stated'
                      CHECK (source IN ('stated', 'confirmed')),
  confirmed_load_id uuid REFERENCES public.loads(load_id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_coverage ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_coverage_agent
  ON public.agent_coverage(agent_id);
-- The Foreman's lookup: "who claims this market?"
CREATE INDEX IF NOT EXISTS idx_agent_coverage_place
  ON public.agent_coverage(state, city);

-- One row per agent per market per named shipper. NULLS NOT DISTINCT so a second
-- unnamed "Savannah, GA" for the same agent collides instead of duplicating
-- (plain UNIQUE treats every NULL as distinct and would let them stack up).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_coverage_place
  ON public.agent_coverage(agent_id, city, state, shipper_name) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- 2. 'unclear' — so nothing is ever parked by inference
-- ---------------------------------------------------------------------------
-- effectiveAgentClass() ends `card?.autoClass ?? "spot"`, so a NULL class already
-- READS as spot everywhere. Three states, three meanings:
--   NULL      never asked      — auto-derivation is in charge
--   'unclear' asked, can't tell — stays in the working book, comes round again
--   'spot'    asked, confirmed  — the only value that permits parking
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_class_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_agent_class_check
  CHECK (agent_class IN ('direct', 'unclear', 'spot'));

-- ---------------------------------------------------------------------------
-- 3. work_status — parked leaves every working view, stays in every analytical one
-- ---------------------------------------------------------------------------
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'active'
    CHECK (work_status IN ('active', 'parked'));

-- Only a PINNED 'spot' may park an agent; a derived one never can.
--
-- NOTE the COALESCE — it is load-bearing, not decoration. Written the obvious
-- way as `... OR agent_class = 'spot'`, a NULL class makes that arm NULL, the
-- whole expression evaluates to NULL, and Postgres treats an unknown CHECK as
-- SATISFIED. A never-asked agent would park cleanly and the guard would be
-- silently inert. COALESCE forces a real FALSE.
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_park_needs_pinned_spot;
ALTER TABLE public.agents ADD CONSTRAINT agents_park_needs_pinned_spot
  CHECK (work_status = 'active' OR COALESCE(agent_class, '') = 'spot');

-- ---------------------------------------------------------------------------
-- 4. Freight capability — on the AGENT, multi-valued
-- ---------------------------------------------------------------------------
-- Mirrors the load_type enum (017) so a CLAIMED capability can be checked
-- against what the agent has actually tendered. Kept as text[] rather than
-- load_type[] so the claim vocabulary can drift from the load enum without a
-- type migration; `<@` pins it to the same four values today.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS freight_types text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_freight_types_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_freight_types_check
  CHECK (freight_types <@ ARRAY['standard flatbed', 'oversize', 'hazmat', 'heavy haul']::text[]);

-- ---------------------------------------------------------------------------
-- 5. 'qualification' contact type — the Tier 3 sweep call
-- ---------------------------------------------------------------------------
-- ADD VALUE only. 'check_in' stays in the enum: rows already reference it, and
-- the UI can stop offering it without a schema change. Retiring it is a separate
-- decision with a backfill attached.
--
-- `IF NOT EXISTS` rather than the usual DO/pg_enum guard on purpose. The runner
-- sends each file as one multi-statement query, so everything here shares an
-- implicit transaction, and ALTER TYPE ... ADD VALUE has a long history of
-- refusing to run inside one. This form is natively idempotent, needs no DO
-- block, and is fine in a transaction on PG 12+ (prod is 17.6) so long as the
-- new value is not USED until after commit — nothing below uses it.
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'qualification';
