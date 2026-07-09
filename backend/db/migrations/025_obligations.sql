-- Monthly obligations: recurring cash outflows NOT on the P&L (loan principal,
-- owner draws) so the Expenses page can show a TRUE cash break-even alongside
-- the accounting one. User-level + recurring (same each month) — v1 applies
-- them uniformly to every month (not effective-dated).
CREATE TABLE IF NOT EXISTS obligations (
    obligation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    label VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
