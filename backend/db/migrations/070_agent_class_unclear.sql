-- 070_agent_class_unclear.sql
-- Repair: 'unclear' never actually reached the agent_class CHECK on prod.
--
-- 068 was supposed to widen agents_agent_class_check from 058's ('direct','spot')
-- to ('direct','unclear','spot'). On prod the pair did not take, and the check
-- that was supposed to confirm it counted constraint NAMES rather than reading
-- definitions — which can never detect a failed MODIFICATION, because 058 had
-- already created a constraint of exactly that name. The two genuinely NEW
-- constraints in 068 landed fine; the one that was an edit did not.
--
-- Live effect: Dispatch selected "Unclear" on the qualification sweep, PATCH
-- /agents sent agent_class='unclear', Postgres rejected it, and the API
-- returned a 500 with no usable message.
--
-- Idempotent, and safe to re-run over either the 058 or the 068 definition.

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_class_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_agent_class_check
  CHECK (agent_class IN ('direct', 'unclear', 'spot'));

COMMENT ON COLUMN public.agents.agent_class IS
  'NULL = never asked (auto-derivation from loads is in charge). '
  '''unclear'' = asked and could not tell — stays in the working book. '
  '''direct'' / ''spot'' = asked and answered. Only a pinned ''spot'' permits parking.';
