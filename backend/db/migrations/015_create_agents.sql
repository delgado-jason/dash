DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preferred_contact') THEN
    CREATE TYPE preferred_contact AS ENUM (
      'phone',
      'email',
      'text'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS agents (
   agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
   broker_id UUID NOT NULL REFERENCES brokers(broker_id) ON DELETE RESTRICT,
   first_name VARCHAR(50) NOT NULL,
   last_name VARCHAR(50) NOT NULL,
   phone VARCHAR(50) NULL,
   email VARCHAR(50) NULL,
   preferred_contact preferred_contact NULL DEFAULT 'email',
   rating SMALLINT NULL CHECK(rating > 0 AND rating < 6),
   notes TEXT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

   CONSTRAINT agent_per_user UNIQUE(first_name, last_name, user_id)
);