-- 073_relationships_v2.sql
-- Relationships v2 — REL-01 v2.0 (Jason's nod sheet, 2026-09-12, "all leans").
--
-- What changed underneath the book:
--   * Five buckets instead of three tiers. Tier 1/2/3 now hold only agents
--     with an ESTABLISHED footprint (>= 3 delivered loads), graded by all-in
--     RPM against the live rate ladder. Everyone else is a Prospect, or
--     Parked. The bucket is DERIVED, never stored: work_status = 'parked' →
--     Parked; relationship_tier 1/2/3 → that tier; NULL → Prospect (or
--     dormant → Parked, by the 180-day rule in the frontend).
--   * Tiering is the OWNER'S call with a written reason; dash only suggests.
--     Every tier change lands in agent_tier_history (decision 8).
--   * A touch now carries its outcome, next step, footprint flag, which other
--     reasons the same message carried (the one-a-week cap, decision 3/§4),
--     and whether the cap was deliberately overridden.
--   * A load carries a claim flag (decision 4 — the on-time, claim-free streak).
--   * Agency code is optional on a prospect (v1 sheet): broker_id nullable.
--
-- Idempotent throughout (069 style): ADD COLUMN IF NOT EXISTS, DROP
-- CONSTRAINT IF EXISTS, CREATE TABLE IF NOT EXISTS, ADD VALUE IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. contact_type — the v2 touch vocabulary
-- ---------------------------------------------------------------------------
-- ADD VALUE only; the old values stay valid for the rows that carry them
-- ('check_in' / 'appreciation' / 'qualification' leave the pickers, 'cold' is
-- relabelled "Prospecting", 'capacity' → "Capacity heads-up",
-- 'inbound_inquiry' → "Load offer"). Same form and same rule as 068: the
-- runner sends this file as one implicit transaction, and a value added by
-- ALTER TYPE may not be USED until that transaction commits — nothing below
-- references a new value.
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'milestone';
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'holiday';
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'reactivation';
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'owner_personal';
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'load_in_progress';
ALTER TYPE contact_type ADD VALUE IF NOT EXISTS 'freight_bill';

-- ---------------------------------------------------------------------------
-- 2. agent_contacts — what one touch carries in v2
-- ---------------------------------------------------------------------------
-- outcome            calls only: did anyone pick up (a 'reached' call is a
--                    two-way contact and resets cooling; voicemail is not)
-- next_step          what is owed after the touch, and when
-- footprint_captured the six-question footprint was taken on this call
-- combined_types     the OTHER reasons this one message also carried, so a
--                    second reason in the same week folds into the first
--                    message instead of breaking the one-a-week cap. Plain
--                    text[] on purpose — a contact_type[] would USE the enum
--                    values added above inside the same transaction.
-- cap_override       the operator logged a second proactive touch on purpose
ALTER TABLE public.agent_contacts
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS next_step_at date,
  ADD COLUMN IF NOT EXISTS footprint_captured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS combined_types text[],
  ADD COLUMN IF NOT EXISTS cap_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.agent_contacts DROP CONSTRAINT IF EXISTS agent_contacts_outcome_check;
ALTER TABLE public.agent_contacts ADD CONSTRAINT agent_contacts_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('reached', 'voicemail', 'no_answer', 'bad_number'));

ALTER TABLE public.agent_contacts DROP CONSTRAINT IF EXISTS agent_contacts_next_step_check;
ALTER TABLE public.agent_contacts ADD CONSTRAINT agent_contacts_next_step_check
  CHECK (next_step IS NULL OR next_step IN ('call_back', 'on_their_list', 'send_capacity', 'none'));

-- ---------------------------------------------------------------------------
-- 3. loads.claim_filed — decision 4, the streak's second half
-- ---------------------------------------------------------------------------
-- Set by Dispatch when an OS&D or damage claim lands. Default off; the streak
-- itself is computed (PR2/PR4), nothing here writes it.
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS claim_filed boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. agents — optional tier, optional code, best time to call
-- ---------------------------------------------------------------------------
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS best_time_to_call text;

-- The tier is now the owner's explicit call or nothing. 064's NOT NULL
-- DEFAULT 3 meant "untiered long tail"; in v2 that state is NULL (= Prospect,
-- or dormant → Parked). New agents land with no tier.
ALTER TABLE public.agents ALTER COLUMN relationship_tier DROP NOT NULL;
ALTER TABLE public.agents ALTER COLUMN relationship_tier DROP DEFAULT;

-- Re-grade the long tail: every current Tier 3 seat becomes untiered.
-- Tier 1 and Tier 2 are kept as-is — they are explicit owner calls and get
-- suggestion chips in the book instead of being moved silently (decision 8).
--
-- VERIFY before/after with:
--   SELECT a.first_name, a.last_name, a.relationship_tier,
--          count(l.load_id) AS delivered
--   FROM agents a JOIN loads l ON l.agent_id = a.agent_id
--                              AND l.load_status = 'delivered'
--   WHERE a.relationship_tier = 3
--   GROUP BY 1, 2, 3 HAVING count(l.load_id) >= 3;
--
-- PROD (per the nod sheet, 2026-09-12): the four established agents — Brian
-- Williams, Mike Sorrentino, Eric Hesketh, Drew Hannon — all sit at Tier 1/2,
-- so the SELECT returns 0 rows and no established agent loses a tier here.
-- DEV (seed data, checked 2026-09-12 before this ran): 9 agents, all Tier 3;
-- 7 of them have >= 3 delivered seed loads, so on dev they surface in the
-- book's NEEDS A TIER section rather than Prospects. That is the intended
-- behaviour for an established agent with no owner-set tier.
--
-- tier_set_at IS NULL is what tells the DEFAULT apart from a decision: 064's
-- DEFAULT 3 never stamped tier_set_at, while every explicit tier write did
-- (v1 stamped it on any PATCH carrying a tier; v2 stamps it on a real change).
-- So an owner's deliberate Tier 3 survives, and the statement is safe to
-- re-apply after v2 is live. On prod today every Tier 3 row has a NULL
-- tier_set_at, so the result is identical to an unguarded UPDATE.
UPDATE public.agents
   SET relationship_tier = NULL
 WHERE relationship_tier = 3
   AND tier_set_at IS NULL;

-- A prospect is a PERSON first; the agency code is billing paperwork that may
-- not be known yet. Reads use LEFT JOIN brokers from here on.
ALTER TABLE public.agents ALTER COLUMN broker_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. agent_tier_history — every tier change, with its reason (decision 8)
-- ---------------------------------------------------------------------------
-- from_tier / to_tier NULL = "no tier" (Prospect). source 'owner' is a human
-- decision; 'dash' is reserved for a later, explicitly approved automation.
CREATE TABLE IF NOT EXISTS public.agent_tier_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  agent_id   uuid NOT NULL REFERENCES public.agents(agent_id) ON DELETE CASCADE,
  from_tier  smallint,
  to_tier    smallint,
  reason     text NOT NULL,
  source     text NOT NULL DEFAULT 'owner' CHECK (source IN ('owner', 'dash')),
  changed_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_tier_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_tier_history_agent
  ON public.agent_tier_history(agent_id);

-- ---------------------------------------------------------------------------
-- 6. relationship_reviews — the month / quarter sign-off (REL-01 §5H)
-- ---------------------------------------------------------------------------
-- Lands now so v2 ships as ONE migration; PR4 (Review) writes it.
-- period_key: 'YYYY-MM' for a month, 'YYYY-Qn' for a quarter.
-- targets:    the 1–3 targets set for the period ahead, free text.
CREATE TABLE IF NOT EXISTS public.relationship_reviews (
  review_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  period_key  text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('month', 'quarter')),
  targets     text,
  reviewed_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_key, kind)
);
ALTER TABLE public.relationship_reviews ENABLE ROW LEVEL SECURITY;
