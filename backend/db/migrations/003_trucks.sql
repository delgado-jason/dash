DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'truck_status') THEN
    CREATE TYPE truck_status AS ENUM (
      'active',
      'maintenance',
      'out_of_service'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS trucks (
  truck_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL
    REFERENCES users(user_id)
    ON DELETE CASCADE,

  -- Identification
  unit_number VARCHAR(20) NOT NULL,
  vin VARCHAR(17) NOT NULL,
  plate_number VARCHAR(15),
  plate_state VARCHAR(2),

  -- Specs
  make VARCHAR(50),
  model VARCHAR(50),
  year INTEGER,

  -- Operations
  current_odometer INTEGER NOT NULL DEFAULT 0,
  status truck_status NOT NULL DEFAULT 'active',
  in_service_date DATE,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE (vin),
  UNIQUE (user_id, unit_number)
);