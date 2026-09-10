-- 069_park_reason.sql
-- Parking should not require lying about the freight (Jason, 2026-09-10).
--
-- 068 made a pinned agent_class='spot' the ONLY key that unlocks parking. That
-- was right when the only reason to park someone was "they work the board and
-- have no customers." It is wrong for the case that actually turned up first:
-- a person who is not the freight decision-maker at all.
--
-- Mary Morrison at SRY auto-derives 'direct' from two real repeat facilities.
-- To park her under 068 you must first pin 'spot', which effectiveAgentClass
-- makes win over the derivation — so you assert her agency is a board-only shop
-- in order to say "this person is office staff." The constraint forces a
-- falsehood about the FREIGHT in order to record a fact about the PERSON.
--
-- Those are two different reasons to leave the call book, so accept either:
--   a pinned 'spot'      — the freight reason (068's original case)
--   a written park_reason — any other reason, stated in words
--
-- What has NOT changed: parking still cannot happen by inference. A NULL class
-- with no reason written is still rejected, so a never-asked agent can never
-- silently drop out of the book. The COALESCE on both arms is load-bearing for
-- the same reason it was in 068 — a NULL arm makes the whole CHECK evaluate to
-- NULL, and Postgres treats an unknown CHECK as SATISFIED.
--
-- Idempotent.

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS park_reason text;

COMMENT ON COLUMN public.agents.park_reason IS
  'Why this row left the call book, in words. Required to park unless agent_class is a pinned spot.';

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_park_needs_pinned_spot;
ALTER TABLE public.agents ADD CONSTRAINT agents_park_needs_pinned_spot
  CHECK (
    work_status = 'active'
    OR COALESCE(agent_class, '') = 'spot'
    OR COALESCE(btrim(park_reason), '') <> ''
  );
