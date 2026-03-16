

CREATE TABLE IF NOT EXISTS fuel_entries (
    -- Identity
    fuel_entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    -- Relationships
    truck_id UUID NOT NULL,
    trip_id UUID NULL,

    -- Fuel Data
    fuel_date DATE NOT NULL,
    gallons NUMERIC(6, 3) NOT NULL CHECK(gallons > 0),
    price_per_gallon NUMERIC(5, 3) NOT NULL CHECK(price_per_gallon > 0), -- XX.XXX Can't go over 99.999

    -- Tracking
    odometer_reading INTEGER NOT NULL CHECK(odometer_reading >= 0),
    company_name VARCHAR(100),
    fuel_city VARCHAR(50),
    fuel_state CHAR(2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_truck FOREIGN KEY (truck_id) REFERENCES trucks(truck_id) ON DELETE SET NULL,
    CONSTRAINT fk_trip FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE SET NULL
);