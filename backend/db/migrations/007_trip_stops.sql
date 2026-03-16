-- Create ENUMS

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stop_type') THEN
    CREATE TYPE stop_type AS ENUM (
      'pickup',
      'delivery'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS trip_stops (
    stop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    user_id UUID NOT NULL,
    stop_order SMALLINT NOT NULL CHECK(stop_order > 0),
    stop_type STOP_TYPE NOT NULL,
    location TEXT NOT NULL,
    scheduled_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_trip FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (trip_id, stop_order)
);