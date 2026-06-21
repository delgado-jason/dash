CREATE TABLE IF NOT EXISTS agent_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE RESTRICT,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(5) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_notes_agent_id ON agent_notes(agent_id);