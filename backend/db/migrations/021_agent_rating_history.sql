CREATE TABLE IF NOT EXISTS agent_rating_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
    old_rating SMALLINT CHECK(old_rating > 0 AND old_rating < 6),
    new_rating SMALLINT NOT NULL CHECK(new_rating > 0 AND new_rating < 6),
    reason TEXT NOT NULL,
    changed_by VARCHAR(5) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_rating_history_agent_id ON agent_rating_history(agent_id);