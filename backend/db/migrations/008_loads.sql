DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mileage_source') THEN
    CREATE TYPE mileage_source AS ENUM (
      'user',
      'system_estimated',
      'broker_confirmed'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'load_status') THEN
    CREATE TYPE load_status AS ENUM (
      'booked',
      'in_transit',
      'delivered',
      'cancelled',
      'tonu'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'unpaid',
      'invoiced',
      'paid'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS loads (
    -- Core Identity
    load_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL,
    user_id UUID NOT NULL,

    -- Freight Details
    load_number VARCHAR(20) NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    pickup_date DATE NOT NULL,
    delivery_date DATE,
    load_status LOAD_STATUS NOT NULL DEFAULT 'booked',

    -- Revenue
    linehaul NUMERIC(7, 2) NOT NULL CHECK(linehaul >= 0),
    fuel_surcharge NUMERIC(7, 2) NOT NULL CHECK(fuel_surcharge >= 0),

    -- Miles
    loaded_miles INTEGER NOT NULL CHECK(loaded_miles >= 0),
    mileage_source MILEAGE_SOURCE NOT NULL DEFAULT 'broker_confirmed',

    -- Payment Tracking
    payment_status PAYMENT_STATUS NOT NULL DEFAULT 'unpaid',

    -- Meta
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_trip FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);