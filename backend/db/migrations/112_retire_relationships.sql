-- 112: retire the Relationships feature's tables and columns.
--
-- The retirement sheet (Nov 15, 2026, call 9): the tier system is gone — an
-- agent is measured by the rating alone — and with it the Review (never run:
-- 0 rows) and the tier history (12 rows, all written on 2026-09-12, the day
-- the model was published, and never again). The columns the owner's tier
-- lived in go with them.
--
-- DESTRUCTIVE, so by the Nov 8 rule it is applied only AFTER v1.294.0 is live
-- on Railway and Vercel — the last code that read these columns is gone from
-- production first — and only after `backend/db/dump.sh prod` (and dev). The
-- contact log (agent_contacts), the footprint (agent_coverage) and the park
-- (agents.work_status / park_reason) are NOT touched: the Foreman and the
-- agent's file read them. agent_class and the contact-cap columns on
-- agent_contacts stay too — harmless, and not this round's churn (call 9A).

DROP TABLE IF EXISTS public.relationship_reviews;
DROP TABLE IF EXISTS public.agent_tier_history;

ALTER TABLE public.agents DROP COLUMN IF EXISTS relationship_tier;
ALTER TABLE public.agents DROP COLUMN IF EXISTS tier_set_at;
