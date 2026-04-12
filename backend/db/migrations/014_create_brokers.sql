
CREATE TABLE IF NOT EXISTS brokers ( 

    broker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, broker_name VARCHAR(50) NOT NULL, 
    phone VARCHAR(50) NULL,
    email VARCHAR(50) NULL,
    rating SMALLINT NULL CHECK(rating > 0 AND rating < 6),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_broker_per_user UNIQUE(user_id, broker_name)
);