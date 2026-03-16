-- Create ENUMS

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_status') THEN
    CREATE TYPE trip_status AS ENUM (
      'planned',
      'active',
      'completed',
      'cancelled'
    );
  END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_type') THEN
        CREATE TYPE trip_type AS ENUM (
        'revenue',
        'deadhead'
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_source') THEN
        CREATE TYPE trip_source AS ENUM (
        'user',
        'system'
        );
    END IF;
END
$$;


-- Create the trips table

CREATE TABLE IF NOT EXISTS trips (
    trip_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    
    truck_id UUID,
    driver_id UUID,
    trip_type TRIP_TYPE NOT NULL,
    trip_source TRIP_SOURCE NOT NULL,
    trip_date DATE NOT NULL,
    status TRIP_STATUS NOT NULL DEFAULT 'planned',
    odometer_start INTEGER CHECK(odometer_start >= 0),
    odometer_end INTEGER CHECK(odometer_end >= 0),
    is_estimated BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_truck FOREIGN KEY (truck_id) REFERENCES trucks(truck_id) ON DELETE SET NULL,
    CONSTRAINT fk_driver FOREIGN KEY (driver_id) REFERENCES drivers(driver_id) ON DELETE SET NULL
);