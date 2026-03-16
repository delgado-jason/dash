
CREATE TABLE IF NOT EXISTS accessorials (
    accessorial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id UUID NOT NULL,
    user_id UUID NOT NULL,
    accessorial_type TEXT NOT NULL,
    amount NUMERIC(7, 2) NOT NULL CHECK(amount >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_load FOREIGN KEY (load_id) REFERENCES loads(load_id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);