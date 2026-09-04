-- The agent-relationship system (Jason, 2026-09-03; approved mockups).
-- Tiers are the OWNER'S call (data only suggests); every contact is one row;
-- attribution lives on the load; prospect lifecycle is DERIVED (an agent with
-- zero loads IS a prospect — no status column to rot).

-- Relationship tier: 1 = weekly attention (cap enforced in UI), 2 = proven
-- occasional, 3 = everyone else + the cold pool. Prospects land at 3.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS relationship_tier smallint NOT NULL DEFAULT 3
    CHECK (relationship_tier BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS tier_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_city varchar(100),
  ADD COLUMN IF NOT EXISTS agent_state varchar(2),
  ADD COLUMN IF NOT EXISTS source varchar(40); -- where a prospect came from

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_direction') THEN
    CREATE TYPE contact_direction AS ENUM ('outbound', 'inbound');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_method') THEN
    CREATE TYPE contact_method AS ENUM ('call', 'email', 'text');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_type') THEN
    CREATE TYPE contact_type AS ENUM
      ('capacity', 'check_in', 'appreciation', 'close_out', 'cold', 'inbound_inquiry', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booked_via') THEN
    CREATE TYPE booked_via AS ENUM ('agent_reached_out', 'i_reached_out');
  END IF;
END
$$;

-- One row per touch, either direction. "Last contacted" is ALWAYS derived
-- from this log (MAX per agent), never stored anywhere.
CREATE TABLE IF NOT EXISTS public.agent_contacts (
  contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(agent_id) ON DELETE CASCADE,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  direction contact_direction NOT NULL,
  method contact_method NOT NULL,
  type contact_type NOT NULL,
  note text,
  load_id uuid REFERENCES public.loads(load_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_contacts_agent ON public.agent_contacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_contacts_when ON public.agent_contacts(contacted_at);

-- Attribution: did the agent bring this load to Jason, or did he go get it?
-- REQUIRED on new loads by the frontend; legacy nulls sit outside every
-- percentage's denominator (labeled on-surface).
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS booked_via booked_via;
