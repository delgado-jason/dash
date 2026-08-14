-- 058_agent_class.sql
-- Manual override for an agent's relationship bucket. NULL = auto (derived from
-- loads: a shipper OR receiver hit 2+ times through the agent = direct customer,
-- else spot market). 'direct' / 'spot' pin the owner's call when the data can't
-- see it yet. Idempotent.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_class text;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_class_check;
ALTER TABLE agents ADD CONSTRAINT agents_agent_class_check
  CHECK (agent_class IN ('direct', 'spot'));
